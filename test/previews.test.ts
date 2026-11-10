import { describe, expect, it } from "vitest";
import { findPreviews } from "../src/previews.ts";

describe("findPreviews", () => {
  it("finds #Preview macros and PreviewProvider structs in order, with names and lines", () => {
    const source = [
      "import SwiftUI",
      "struct Card: View { var body: some View { Text(\"Hi\") } }",
      "#Preview { Card() }",
      '#Preview("Dark", traits: .sizeThatFitsLayout) { Card() }',
      "struct Card_Previews: PreviewProvider {",
      "  static var previews: some View { Card() }",
      "}",
    ].join("\n");

    expect(findPreviews(source)).toEqual([
      { index: 0, line: 3 },
      { index: 1, line: 4, name: "Dark" },
      { index: 2, line: 5, name: "Card_Previews" },
    ]);
  });

  it("ignores previews inside line, block and nested block comments", () => {
    const source = [
      "// #Preview { A() }",
      "/* struct Old_Previews: PreviewProvider {}",
      "   /* nested */ #Preview { B() }",
      "*/",
      "#Preview { C() }",
    ].join("\n");

    expect(findPreviews(source)).toEqual([{ index: 0, line: 5 }]);
  });

  it("ignores previews inside plain, multi-line, raw and interpolated strings", () => {
    const source = [
      'let a = "#Preview"',
      'let b = """',
      "  #Preview { X() }",
      '  """',
      'let c = #"#Preview "quoted" "#',
      'let d = "\\(f(")")) #Preview"',
      "#Preview { Real() }",
    ].join("\n");

    expect(findPreviews(source)).toEqual([{ index: 0, line: 7 }]);
  });

  it("decodes escapes in preview titles", () => {
    expect(findPreviews('#Preview("Caf\\u{E9} \\"menu\\"") {}')[0]?.name).toBe('Café "menu"');
  });

  it("doesn't treat look-alike identifiers as previews", () => {
    const source = "@Previewable @State var on = true\nstruct Thing: View, Previewish {}\n#PreviewLike {}";
    expect(findPreviews(source)).toEqual([]);
  });
});
