import * as vscode from "vscode";
import { PreviewController } from "./controller.ts";
import { XcodeClient, messageOf } from "./xcode/client.ts";
import { resolveDeveloperDir } from "./xcode/setup.ts";

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Xcode Preview", { log: true });
  const xcode = new XcodeClient({
    developerDir: () => resolveDeveloperDir(vscode.workspace.getConfiguration("xcodePreview").get("developerDir", "")),
    clientVersion: String(context.extension.packageJSON.version),
    log: (line) => log.info(line),
  });
  const controller = new PreviewController(context, xcode, log);

  /** Registers a command whose failures show up as an error message instead of disappearing. */
  const command = (id: string, run: (...args: never[]) => unknown) =>
    vscode.commands.registerCommand(id, async (...args: never[]) => {
      try {
        await run(...args);
      } catch (error) {
        log.error(messageOf(error));
        void vscode.window.showErrorMessage(`Xcode Preview: ${messageOf(error)}`);
      }
    });

  context.subscriptions.push(
    log,
    controller,
    { dispose: () => void xcode.close() },
    command("xcodePreview.open", (uri?: vscode.Uri) => controller.open(uri)),
    command("xcodePreview.refresh", () => controller.refresh()),
    command("xcodePreview.selectProject", () => controller.selectProject()),
    command("xcodePreview.selectScheme", () => controller.selectScheme()),
    command("xcodePreview.checkSetup", () => controller.checkSetup()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      // Reconnect lazily to the newly chosen Xcode.
      if (event.affectsConfiguration("xcodePreview.developerDir")) void xcode.close();
    }),
  );
}

export function deactivate(): void {}
