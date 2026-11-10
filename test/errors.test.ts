import { describe, expect, it } from "vitest";
import { summarizeError } from "../src/errors.ts";

describe("summarizeError", () => {
  it("reduces a preview compile failure to its diagnostics", () => {
    // Trimmed from a real Xcode 27 RenderPreview failure.
    const message = [
      "PreviewFailedError: Preview errored.",
      "",
      "==================================",
      "",
      "|  UpdateSessionError",
      "|  |  CompileDylibError: Failed to build ShareButtonLinkView.swift",
      "|  |  Compiling failed: ambiguous use of '__designTimeSelection'",
      "|  |  /Users/me/app/iOS/ShareButtonLinkView.swift:27:9: error: ambiguous use of '__designTimeSelection'",
      "|  |  -frontend -c -filelist /Users/me/Library/Developer/Xcode/DerivedData/…",
    ].join("\n");

    expect(summarizeError(message)).toEqual(["ShareButtonLinkView.swift:27: ambiguous use of '__designTimeSelection'"]);
  });

  it("falls back to the first meaningful line", () => {
    const message = "SourceContainsNoPreviewsError: Source in file contains no #Preview nor PreviewProvider structs.\n\nSource File Path: App/View.swift";
    expect(summarizeError(message)).toEqual([
      "SourceContainsNoPreviewsError: Source in file contains no #Preview nor PreviewProvider structs.",
    ]);
  });
});
