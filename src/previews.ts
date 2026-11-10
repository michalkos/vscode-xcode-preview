/** A `#Preview` macro or `PreviewProvider` struct found in a Swift file. */
export type PreviewDeclaration = {
  /** Zero-based position among the file's previews, as Xcode's RenderPreview counts them. */
  index: number;
  /** The `#Preview("Name")` title or the provider's struct name, if any. */
  name?: string;
  /** One-based line of the declaration. */
  line: number;
};

type Token = { kind: "word" | "string" | "punct"; text: string; offset: number };

/**
 * Lists the previews in Swift source, top to bottom, skipping anything inside comments or
 * string literals. A lightweight scanner rather than a parser: it only needs to agree with
 * Xcode on which previews exist and in what order.
 */
export function findPreviews(source: string): PreviewDeclaration[] {
  const tokens = tokenize(source);
  const lineOf = lineLookup(source);
  const found: Omit<PreviewDeclaration, "index">[] = [];

  tokens.forEach((token, i) => {
    if (token.kind !== "word") return;

    if (token.text === "#Preview") {
      const title = tokens[i + 1]?.text === "(" ? tokens[i + 2] : undefined;
      found.push({
        line: lineOf(token.offset),
        ...(title?.kind === "string" && title.text ? { name: title.text } : {}),
      });
      return;
    }

    const name = tokens[i + 1];
    if (token.text === "struct" && name?.kind === "word") {
      const bodyStart = tokens.findIndex((t, j) => j > i && t.text === "{");
      const header = tokens.slice(i + 2, bodyStart === -1 ? undefined : bodyStart);
      if (header.some((t) => t.kind === "word" && t.text === "PreviewProvider")) {
        found.push({ line: lineOf(token.offset), name: name.text });
      }
    }
  });

  return found.map((preview, index) => ({ index, ...preview }));
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i]!;

    if (/\s/.test(c)) {
      i++;
    } else if (src.startsWith("//", i)) {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
    } else if (src.startsWith("/*", i)) {
      i = skipBlockComment(src, i);
    } else if (isStringStart(src, i)) {
      const literal = readString(src, i);
      tokens.push({ kind: "string", text: literal.text, offset: i });
      i = literal.end;
    } else {
      const word = /[#@]?[A-Za-z_][A-Za-z0-9_]*/y;
      word.lastIndex = i;
      const match = word.exec(src);
      if (match) {
        tokens.push({ kind: "word", text: match[0], offset: i });
        i += match[0].length;
      } else {
        tokens.push({ kind: "punct", text: c, offset: i });
        i++;
      }
    }
  }
  return tokens;
}

// Swift block comments nest: an inner "/*" needs its own "*/" before the outer one closes.
function skipBlockComment(src: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    if (src.startsWith("/*", i)) {
      depth++;
      i += 2;
    } else if (src.startsWith("*/", i)) {
      depth--;
      i += 2;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return src.length;
}

/** A string starts with `"`, or with one or more `#` followed by `"` for raw strings. */
function isStringStart(src: string, i: number): boolean {
  let j = i;
  while (src[j] === "#") j++;
  return src[j] === '"';
}

/** Reads a string literal (plain, multi-line or raw) and returns its text without interpolations. */
function readString(src: string, start: number): { text: string; end: number } {
  let i = start;
  while (src[i] === "#") i++;
  const hashes = "#".repeat(i - start);
  const multiline = src.startsWith('"""', i);
  i += multiline ? 3 : 1;

  const close = (multiline ? '"""' : '"') + hashes;
  const escape = "\\" + hashes;
  let text = "";

  while (i < src.length) {
    if (src.startsWith(close, i)) return { text, end: i + close.length };
    if (src.startsWith(escape, i)) {
      i += escape.length;
      if (src[i] === "(") {
        i = skipInterpolation(src, i + 1);
      } else {
        const unicode = /u\{([0-9a-fA-F]{1,8})\}/y;
        unicode.lastIndex = i;
        const match = unicode.exec(src);
        if (match) {
          text += String.fromCodePoint(Number.parseInt(match[1]!, 16));
          i += match[0].length;
        } else {
          const ch = src[i] ?? "";
          text += ({ n: "\n", t: "\t", r: "\r", "0": "\0" } as Record<string, string>)[ch] ?? ch;
          i++;
        }
      }
    } else if (!multiline && src[i] === "\n") {
      return { text, end: i }; // Unterminated; stop at the line end.
    } else {
      text += src[i];
      i++;
    }
  }
  return { text, end: src.length };
}

/** Skips the body of `\( ... )`, which may itself contain strings and parentheses. */
function skipInterpolation(src: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < src.length) {
    if (isStringStart(src, i)) {
      i = readString(src, i).end;
      continue;
    }
    if (src[i] === "(") depth++;
    if (src[i] === ")" && --depth === 0) return i + 1;
    i++;
  }
  return src.length;
}

function lineLookup(src: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (starts[mid]! <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
}
