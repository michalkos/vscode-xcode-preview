import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";
import { basename } from "node:path";
import { z } from "zod";
import { pickNavigatorPath } from "../project.ts";
import { GlobResult, OpenWorkspaceResult, RenderPreviewResult, SchemesResult } from "./schemas.ts";

export type XcodeClientOptions = {
  /** `Contents/Developer` folder of the Xcode to use; `xcode-select`'s choice when undefined. Read on each connect. */
  developerDir: () => string | undefined;
  clientVersion: string;
  log: (line: string) => void;
};

/** Which preview to render, and with which of Xcode's canvas overrides. */
export type RenderRequest = {
  workspace: string;
  navigatorPath: string;
  index: number;
  timeoutSeconds: number;
  destination?: string | undefined;
  locale?: string | undefined;
  variants?: Record<string, string> | undefined;
  groupItem?: number | undefined;
  timeline?: number | undefined;
  /** Runs the preview live for this many seconds before the snapshot, so `.task`, `onAppear` and animations settle. */
  interactiveDelay?: number | undefined;
};

export class XcodeToolError extends Error {
  readonly tool: string;
  constructor(tool: string, message: string) {
    super(message);
    this.tool = tool;
  }
}

/**
 * Typed access to the Xcode MCP tools this extension needs, via `xcrun mcpbridge` talking to
 * Xcode's headless server. Connects lazily and reconnects after the bridge exits. Has no
 * VS Code dependency, so scripts and tests can use it directly.
 */
export class XcodeClient {
  readonly #options: XcodeClientOptions;
  #connection: Promise<Client> | undefined;
  #connected: Client | undefined;
  #workspaces = new Map<string, Promise<string>>();

  constructor(options: XcodeClientOptions) {
    this.#options = options;
  }

  /** Opens a workspace or project in headless Xcode (once per connection) and returns its identifier. */
  openWorkspace(path: string): Promise<string> {
    let id = this.#workspaces.get(path);
    if (!id) {
      id = this.call("XcodeOpenWorkspace", { path }, OpenWorkspaceResult).then((r) => r.workspaceIdentifier);
      id.catch(() => this.#workspaces.delete(path));
      this.#workspaces.set(path, id);
    }
    return id;
  }

  /** Finds a file on disk in Xcode's project navigator, which is how RenderPreview addresses files. */
  async navigatorPath(workspace: string, fsPath: string): Promise<string> {
    const name = basename(fsPath);
    const { matches } = await this.call("XcodeGlob", { workspaceIdentifier: workspace, pattern: `**/${name}` }, GlobResult);
    const path = pickNavigatorPath(fsPath, matches);
    if (!path) {
      throw new XcodeToolError("XcodeGlob", `${name} isn't in this Xcode project. Check its target membership, or pick another project.`);
    }
    return path;
  }

  renderPreview(request: RenderRequest): Promise<RenderPreviewResult> {
    const { workspace, navigatorPath, index, timeoutSeconds, destination, locale, variants, groupItem, timeline, interactiveDelay } =
      request;
    const hasCanvas = groupItem !== undefined || timeline !== undefined;
    const interactive = interactiveDelay !== undefined;
    return this.call(
      "RenderPreview",
      {
        workspaceIdentifier: workspace,
        sourceFilePath: navigatorPath,
        previewDefinitionIndexInFile: index,
        timeout: timeoutSeconds,
        preferredRenderDestination: destination ? { identifier: destination } : undefined,
        previewLocalizationOverride: locale,
        previewVariantOverrides: variants && Object.keys(variants).length ? variants : undefined,
        previewCanvasControlOverrides: hasCanvas ? { groupItemIndex: groupItem, timelineIndex: timeline } : undefined,
        displayMode: interactive ? "interactive" : undefined,
        // Xcode rejects a delay that isn't shorter than the timeout.
        snapshotDelay: interactive ? Math.min(interactiveDelay, timeoutSeconds - 1) : undefined,
      },
      RenderPreviewResult,
      (timeoutSeconds + 30) * 1000,
    );
  }

  listSchemes(workspace: string) {
    return this.call("XcodeListSchemes", { workspaceIdentifier: workspace }, SchemesResult);
  }

  async switchScheme(workspace: string, schemeName: string): Promise<void> {
    await this.call("XcodeSwitchScheme", { workspaceIdentifier: workspace, schemeName }, z.unknown());
  }

  /** Calls an Xcode tool and validates its JSON result against `schema`. */
  async call<S extends z.ZodType>(tool: string, args: Record<string, unknown>, schema: S, timeoutMs = 60_000): Promise<z.output<S>> {
    const client = await this.#connect();
    this.#options.log(`→ ${tool} ${JSON.stringify(args)}`);

    const result = await client
      .callTool({ name: tool, arguments: args }, { timeout: timeoutMs })
      .catch((error: unknown) => {
        throw new XcodeToolError(tool, messageOf(error));
      });

    const payload = result.structuredContent ?? parseText(result.content);
    if (result.isError) throw new XcodeToolError(tool, errorText(payload));

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new XcodeToolError(tool, `Unexpected ${tool} result from Xcode:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
  }

  async close(): Promise<void> {
    const connection = this.#connection;
    this.#reset();
    const client = await connection?.catch(() => undefined);
    await client?.close();
  }

  #reset(): void {
    this.#connection = undefined;
    this.#connected = undefined;
    this.#workspaces.clear();
  }

  #connect(): Promise<Client> {
    if (!this.#connection) {
      const connection = this.#open();
      connection.catch(() => {
        if (this.#connection === connection) this.#connection = undefined;
      });
      this.#connection = connection;
    }
    return this.#connection;
  }

  async #open(): Promise<Client> {
    const { clientVersion, log } = this.#options;
    const developerDir = this.#options.developerDir();
    const transport = new StdioClientTransport({
      command: "/usr/bin/xcrun",
      args: ["mcpbridge"],
      env: { ...getDefaultEnvironment(), ...(developerDir ? { DEVELOPER_DIR: developerDir } : {}) },
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk: Buffer) => log(chunk.toString().trimEnd()));

    const client = new Client({ name: "Xcode Preview for VS Code", version: clientVersion });
    client.onclose = () => {
      log("Xcode connection closed.");
      if (this.#connected === client) this.#reset();
    };

    log("Connecting to Xcode through xcrun mcpbridge…");
    try {
      await client.connect(transport, { timeout: 30_000 });
    } catch (error) {
      await transport.close().catch(() => {});
      throw new Error(`Couldn't connect to Xcode: ${messageOf(error)}`);
    }
    this.#connected = client;
    return client;
  }
}

function parseText(content: ReadonlyArray<{ type: string; text?: string }>): unknown {
  const text = content.find((item) => item.type === "text")?.text;
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Xcode reports tool errors as `{ "type": "error", "data": "…" }` or as plain text. */
function errorText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["data", "message", "error"] as const) {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "string") return value;
    }
  }
  return JSON.stringify(payload) ?? "Xcode reported an unknown error.";
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
