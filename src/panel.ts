import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { FromWebview, type ToWebview, type ViewState } from "./protocol.ts";

/** The webview panel beside the editor. Renders whatever ViewState it is given and reports user actions. */
export class PreviewPanel implements vscode.Disposable {
  readonly #panel: vscode.WebviewPanel;
  #state: ViewState | undefined;

  constructor(extensionUri: vscode.Uri, onMessage: (message: FromWebview) => void, onClose: () => void) {
    this.#panel = vscode.window.createWebviewPanel(
      "xcodePreview",
      "Preview",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "dist"), vscode.Uri.joinPath(extensionUri, "media")],
      },
    );
    this.#panel.webview.html = html(this.#panel.webview, extensionUri);

    this.#panel.webview.onDidReceiveMessage((raw: unknown) => {
      const message = FromWebview.safeParse(raw);
      if (!message.success) return;
      if (message.data.type === "ready") this.#post();
      else onMessage(message.data);
    });
    this.#panel.onDidDispose(onClose);
  }

  update(state: ViewState): void {
    this.#state = state;
    this.#panel.title = state.fileName ? `Preview: ${state.fileName}` : "Preview";
    this.#post();
  }

  reveal(): void {
    this.#panel.reveal(undefined, true);
  }

  dispose(): void {
    this.#panel.dispose();
  }

  #post(): void {
    if (this.#state) void this.#panel.webview.postMessage({ type: "state", state: this.#state } satisfies ToWebview);
  }
}

function html(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString("base64");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", "webview.css"));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${style}">
  <title>Preview</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
