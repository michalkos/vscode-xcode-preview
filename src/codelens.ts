import * as vscode from "vscode";
import { findPreviews } from "./previews.ts";

/** Puts a "▶ Preview" link above each #Preview and PreviewProvider that opens that preview. */
export class PreviewCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  readonly #changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.#changed.event;

  /** Asks VS Code to fetch the links again, e.g. after the setting changes. */
  refresh(): void {
    this.#changed.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration("xcodePreview", document.uri).get("codeLens", true)) return [];

    return findPreviews(document.getText()).map((preview) => {
      const line = new vscode.Range(preview.line - 1, 0, preview.line - 1, 0);
      return new vscode.CodeLens(line, {
        title: preview.name ? `▶ Preview · ${preview.name}` : "▶ Preview",
        tooltip: "Render this preview with Xcode",
        command: "xcodePreview.open",
        arguments: [document.uri, preview.index],
      });
    });
  }

  dispose(): void {
    this.#changed.dispose();
  }
}
