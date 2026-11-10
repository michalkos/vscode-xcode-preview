/**
 * Turns one of Xcode's preview errors (which can run to tens of kilobytes of compiler
 * invocations) into a few readable lines. Compiler diagnostics become `File.swift:12: message`;
 * otherwise the first meaningful line is used.
 */
export function summarizeError(message: string): string[] {
  const lines = message.split("\n").map((line) => line.replace(/^[\s|]+/, "").trim());

  const diagnostics = new Set<string>();
  for (const line of lines) {
    const match = /^(?:.*\/)?([^/\s][^/]*?\.swift):(\d+)(?::\d+)?: error: (.+)$/.exec(line);
    if (match) diagnostics.add(`${match[1]}:${match[2]}: ${match[3]}`);
  }
  if (diagnostics.size) return [...diagnostics].slice(0, 5);

  const first = lines.find((line) => line && !/^=+$/.test(line)) ?? "Xcode could not render the preview.";
  return [first.length > 400 ? `${first.slice(0, 400)}…` : first];
}
