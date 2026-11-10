import { readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import * as vscode from "vscode";
import { coalesce } from "./coalesce.ts";
import { summarizeError } from "./errors.ts";
import { PreviewPanel } from "./panel.ts";
import { findNearbyContainers } from "./project.ts";
import { findPreviews, type PreviewDeclaration } from "./previews.ts";
import type { FromWebview, Picker, ViewState } from "./protocol.ts";
import { XcodeClient, XcodeToolError, messageOf } from "./xcode/client.ts";
import type { RenderDestination, SupportedOverrides } from "./xcode/schemas.ts";
import { headlessStatus, resolveDeveloperDir, setupGuide } from "./xcode/setup.ts";

type Overrides = {
  destination?: string | undefined;
  locale?: string | undefined;
  variants: Record<string, string>;
  groupItem?: number | undefined;
  timeline?: number | undefined;
};

/** The part of the view that describes the latest render. */
type RenderView = Pick<ViewState, "status" | "message" | "image" | "problems">;

const SETUP_HINT = "If this keeps happening, run “Xcode Preview: Check Setup”.";

/**
 * Owns the preview panel: tracks which Swift file and preview are shown, asks Xcode to render
 * them, and re-renders on save. One panel at a time; it follows the active Swift editor.
 */
export class PreviewController implements vscode.Disposable {
  readonly #context: vscode.ExtensionContext;
  readonly #xcode: XcodeClient;
  readonly #log: vscode.LogOutputChannel;
  readonly #subscriptions: vscode.Disposable[] = [];

  #panel: PreviewPanel | undefined;
  #source: vscode.Uri | undefined;
  #previews: PreviewDeclaration[] = [];
  #selected = 0;
  #overrides: Overrides = { variants: {} };
  #supported: SupportedOverrides | undefined;
  #rendered: RenderDestination | undefined;
  #view: RenderView = {
    status: "idle",
    message: undefined,
    image: undefined,
    problems: [],
  };
  /** Bumped whenever the requested render changes, so stale results are dropped. */
  #version = 0;
  #saveTimer: NodeJS.Timeout | undefined;
  readonly #render = coalesce(() => this.#renderNow());

  constructor(context: vscode.ExtensionContext, xcode: XcodeClient, log: vscode.LogOutputChannel) {
    this.#context = context;
    this.#xcode = xcode;
    this.#log = log;

    this.#subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => this.#onSave(document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        const uri = editor?.document.uri;
        if (this.#panel && uri && isSwift(uri) && uri.toString() !== this.#source?.toString()) {
          this.#show(editor.document);
        }
      }),
    );
  }

  /**
   * Opens the panel for a Swift file (the active editor's by default) and renders one of its
   * previews: `index` when given (from a CodeLens link), otherwise the one already selected.
   */
  async open(uri?: vscode.Uri, index?: number): Promise<void> {
    const target = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!target || !isSwift(target)) {
      void vscode.window.showInformationMessage("Open a Swift file to preview it.");
      return;
    }
    this.#panel ??= new PreviewPanel(
      this.#context.extensionUri,
      (message) => this.#onMessage(message),
      () => {
        this.#panel = undefined;
        this.#source = undefined;
      },
    );
    this.#panel.reveal();
    this.#show(await vscode.workspace.openTextDocument(target), index);
  }

  refresh(): void {
    const document = this.#sourceDocument();
    if (document) this.#parse(document);
    this.#requestRender();
  }

  async selectProject(): Promise<void> {
    const uri = this.#source ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) throw new Error("Open a Swift file first.");
    if (await this.#projectFor(uri, true)) this.#requestRender();
  }

  async selectScheme(): Promise<void> {
    const uri = this.#source ?? vscode.window.activeTextEditor?.document.uri;
    const project = uri && (await this.#projectFor(uri));
    if (!project) throw new Error("Open a Swift file that belongs to an Xcode project first.");

    const workspace = await this.#xcode.openWorkspace(project);
    const { schemes } = await this.#xcode.listSchemes(workspace);
    const pick = await vscode.window.showQuickPick(
      schemes.map((scheme) => ({
        label: scheme.name,
        description: scheme.isActive ? "active" : "",
        scheme: scheme.disambiguatedName,
      })),
      { title: "Scheme used to build previews" },
    );
    if (!pick) return;
    await this.#xcode.switchScheme(workspace, pick.scheme);
    this.#overrides.destination = undefined;
    this.#requestRender();
  }

  async checkSetup(): Promise<void> {
    this.#log.show(true);
    const developerDir = resolveDeveloperDir(configuration().get("developerDir", ""));
    const status = await headlessStatus(developerDir);
    this.#log.info(["Xcode headless server status:", status.report, "", ...setupGuide(status.enabled)].join("\n"));
    if (status.enabled) {
      void vscode.window.showInformationMessage("Xcode headless mode is on. See the Xcode Preview output for approvals.");
    } else {
      void vscode.window.showWarningMessage("Xcode headless mode is off. See the Xcode Preview output to turn it on.");
    }
  }

  dispose(): void {
    clearTimeout(this.#saveTimer);
    this.#panel?.dispose();
    for (const subscription of this.#subscriptions) subscription.dispose();
  }

  #show(document: vscode.TextDocument, index?: number): void {
    const switched = document.uri.toString() !== this.#source?.toString();
    this.#source = document.uri;
    this.#parse(document);
    if (switched) {
      this.#select(0);
      this.#view = { status: "idle", message: undefined, image: undefined, problems: [] };
    }
    if (index !== undefined && index !== this.#selected && index < this.#previews.length) this.#select(index);
    this.#requestRender();
  }

  /** Selects a preview tab. Argument and timeline choices belong to one preview, so they reset. */
  #select(index: number): void {
    this.#selected = index;
    this.#overrides.groupItem = undefined;
    this.#overrides.timeline = undefined;
  }

  #onSave(document: vscode.TextDocument): void {
    if (!this.#panel || !this.#source || !isSwift(document.uri)) return;
    if (document.uri.toString() === this.#source.toString()) {
      this.#parse(document);
      this.#publish();
    }
    if (!configuration(this.#source).get("refreshOnSave", true)) return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.#requestRender(), 300);
  }

  #parse(document: vscode.TextDocument): void {
    this.#previews = findPreviews(document.getText());
    if (this.#selected >= this.#previews.length) this.#selected = 0;
  }

  #onMessage(message: FromWebview): void {
    switch (message.type) {
      case "refresh":
        this.refresh();
        break;
      case "select":
        this.#select(message.index);
        this.#requestRender();
        break;
      case "pick":
        this.#applyPick(message.id, message.value);
        this.#requestRender();
        break;
      case "reveal":
        if (this.#source) void revealLine(this.#source, message.line);
        break;
    }
  }

  #applyPick(id: Picker["id"], value: string): void {
    const chosen = value || undefined;
    if (id === "destination") this.#overrides.destination = chosen;
    else if (id === "locale") this.#overrides.locale = chosen;
    else if (id === "groupItem") this.#overrides.groupItem = chosen === undefined ? undefined : Number(chosen);
    else if (id === "timeline") this.#overrides.timeline = chosen === undefined ? undefined : Number(chosen);
    else {
      const group = id.slice("variant:".length);
      if (chosen) this.#overrides.variants[group] = chosen;
      else delete this.#overrides.variants[group];
    }
  }

  #requestRender(): void {
    this.#version++;
    void this.#render();
  }

  async #renderNow(): Promise<void> {
    const uri = this.#source;
    if (!uri || !this.#panel) return;
    const version = this.#version;
    const preview = this.#previews[this.#selected] ?? this.#previews[0];

    if (!preview) {
      this.#setView({ status: "idle", message: "No #Preview or PreviewProvider in this file.", image: undefined, problems: [] });
      return;
    }

    const destination = this.#destinationLabel();
    this.#setView({
      ...this.#view,
      status: "rendering",
      message: destination ? `Rendering on ${destination}…` : "Rendering…",
    });

    try {
      const project = await this.#projectFor(uri);
      if (!project) {
        this.#setView({
          status: "error",
          message: "No Xcode project found for this file.",
          image: undefined,
          problems: ["Open a folder that contains an .xcodeproj or .xcworkspace, or set xcodePreview.project."],
        });
        return;
      }
      const workspace = await this.#xcode.openWorkspace(project);
      const navigatorPath = await this.#xcode.navigatorPath(workspace, uri.fsPath);
      const result = await this.#xcode.renderPreview({
        workspace,
        navigatorPath,
        index: preview.index,
        timeoutSeconds: configuration(uri).get("renderTimeout", 120),
        ...this.#overrides,
      });
      if (version !== this.#version) return;

      this.#supported = result.supportedOverrides;
      this.#rendered = result.renderedDestination;
      const image = result.snapshot && (await readPng(result.snapshot.path));
      const problems = result.errors.map((error) => (typeof error === "string" ? error : JSON.stringify(error)));
      this.#setView({
        status: image ? "ready" : "error",
        message: image ? this.#destinationLabel() : "Xcode didn't return a snapshot.",
        image: image ?? this.#view.image,
        problems,
      });
    } catch (error) {
      if (version !== this.#version) return;
      const message = messageOf(error);
      this.#log.error(message);
      const isRenderError = error instanceof XcodeToolError && error.tool === "RenderPreview";
      this.#setView({
        status: "error",
        message: "Couldn't render this preview.",
        image: this.#view.image,
        problems: isRenderError ? summarizeError(message) : [...summarizeError(message), SETUP_HINT],
      });
    }
  }

  /**
   * Picks the Xcode workspace or project for a file: the xcodePreview.project setting, else the
   * nearest one up the folder tree, else any in the workspace folder. Asks when several fit, and
   * remembers the answer. `choose` always asks, offering everything in the workspace folder.
   */
  async #projectFor(uri: vscode.Uri, choose = false): Promise<string | undefined> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const root = folder?.uri.fsPath ?? dirname(uri.fsPath);
    const setting = configuration(uri).get("project", "").trim();
    if (setting && !choose) return isAbsolute(setting) ? setting : join(root, setting);

    const nearby = choose ? [] : await findNearbyContainers(uri.fsPath, root);
    const candidates = nearby.length ? nearby : await searchContainers(folder);
    if (candidates.length === 1 && !choose) return candidates[0];
    if (!candidates.length) return undefined;

    const key = `project:${root}`;
    const remembered = this.#context.workspaceState.get<string>(key);
    if (!choose && remembered && candidates.includes(remembered)) return remembered;

    const pick = await vscode.window.showQuickPick(
      candidates.map((path) => ({ label: basename(path), description: relative(root, dirname(path)) || ".", path })),
      { title: "Xcode project to render previews with" },
    );
    if (pick) await this.#context.workspaceState.update(key, pick.path);
    return pick?.path;
  }

  #setView(view: RenderView): void {
    this.#view = view;
    this.#publish();
  }

  #publish(): void {
    this.#panel?.update({
      fileName: this.#source && basename(this.#source.fsPath),
      previews: this.#previews.map((preview) => ({
        index: preview.index,
        line: preview.line,
        label: preview.name ?? (this.#previews.length > 1 ? `Preview ${preview.index + 1}` : "Preview"),
      })),
      selected: this.#selected,
      ...this.#view,
      pickers: this.#pickers(),
    });
  }

  #pickers(): Picker[] {
    const supported = this.#supported;
    if (!supported) return [];
    const withDefault = (options: { value: string; label: string }[]) => [{ value: "", label: "Default" }, ...options];
    const pickers: Picker[] = [];

    if (supported.renderDestinations.length) {
      pickers.push({
        id: "destination",
        label: "Device",
        value: this.#overrides.destination ?? "",
        options: withDefault(supported.renderDestinations.map((d) => ({ value: d.identifier, label: describe(d) }))),
      });
    }
    if (supported.localizations.length > 1) {
      pickers.push({
        id: "locale",
        label: "Language",
        value: this.#overrides.locale ?? "",
        options: withDefault(supported.localizations.map((locale) => ({ value: locale, label: locale }))),
      });
    }
    for (const [group, values] of Object.entries(supported.previewVariants)) {
      pickers.push({
        id: `variant:${group}`,
        label: group,
        value: this.#overrides.variants[group] ?? "",
        options: withDefault(values.map((value) => ({ value, label: value }))),
      });
    }
    const { groupItemIndexes, timelineIndexes } = supported.canvasControls;
    if (groupItemIndexes.length) {
      pickers.push({
        id: "groupItem",
        label: "Argument",
        value: String(this.#overrides.groupItem ?? groupItemIndexes[0]?.index ?? ""),
        options: groupItemIndexes.map((item) => ({ value: String(item.index), label: item.title ?? `#${item.index + 1}` })),
      });
    }
    if (timelineIndexes.length) {
      pickers.push({
        id: "timeline",
        label: "Timeline",
        value: String(this.#overrides.timeline ?? timelineIndexes[0] ?? ""),
        options: timelineIndexes.map((index) => ({ value: String(index), label: `Entry ${index + 1}` })),
      });
    }
    return pickers;
  }

  #destinationLabel(): string | undefined {
    const chosen = this.#supported?.renderDestinations.find((d) => d.identifier === this.#overrides.destination);
    const destination = chosen ?? this.#rendered;
    return destination && describe(destination);
  }

  #sourceDocument(): vscode.TextDocument | undefined {
    const source = this.#source?.toString();
    return vscode.workspace.textDocuments.find((document) => document.uri.toString() === source);
  }
}

function configuration(scope?: vscode.Uri) {
  return vscode.workspace.getConfiguration("xcodePreview", scope);
}

function isSwift(uri: vscode.Uri): boolean {
  return uri.scheme === "file" && uri.fsPath.endsWith(".swift");
}

function describe(destination: RenderDestination): string {
  return [destination.deviceModelName ?? destination.identifier, destination.systemVersion].filter(Boolean).join(" · ");
}

/** Finds every .xcworkspace and .xcodeproj in a workspace folder, skipping dependency and build folders. */
async function searchContainers(folder: vscode.WorkspaceFolder | undefined): Promise<string[]> {
  if (!folder) return [];
  const exclude = "**/{node_modules,Pods,Carthage,.build,build,DerivedData}/**";
  const [workspaces, projects] = await Promise.all([
    vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.xcworkspace/contents.xcworkspacedata"), exclude, 50),
    vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.xcodeproj/project.pbxproj"), exclude, 50),
  ]);
  return [...workspaces, ...projects]
    .map((file) => dirname(file.fsPath))
    .filter((path) => !dirname(path).endsWith(".xcodeproj")) // A project's own embedded workspace.
    .sort();
}

/** Reads a snapshot written by Xcode and returns it as a data URI. */
async function readPng(path: string): Promise<string> {
  const bytes = await readFile(path);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error(`Xcode's snapshot isn't a PNG: ${path}`);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function revealLine(uri: vscode.Uri, line: number): Promise<void> {
  const position = new vscode.Position(line - 1, 0);
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
  await vscode.window.showTextDocument(uri, {
    viewColumn: editor?.viewColumn ?? vscode.ViewColumn.One,
    selection: new vscode.Range(position, position),
  });
}
