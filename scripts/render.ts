// Renders one preview from the command line, without VS Code. Useful for debugging the Xcode side.
// Usage: pnpm render <App.xcodeproj | App.xcworkspace> <File.swift> [previewIndex]
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { summarizeError } from "../src/errors.ts";
import { findPreviews } from "../src/previews.ts";
import { XcodeClient, messageOf } from "../src/xcode/client.ts";

const [project, file, index = "0"] = process.argv.slice(2);
if (!project || !file) {
  console.error("Usage: pnpm render <App.xcodeproj | App.xcworkspace> <File.swift> [previewIndex]");
  process.exit(1);
}

const sourcePath = resolve(file);
console.log("Previews found:", findPreviews(await readFile(sourcePath, "utf8")));

const xcode = new XcodeClient({
  developerDir: () => process.env.DEVELOPER_DIR,
  clientVersion: "dev",
  log: (line) => console.log(line.length > 300 ? `${line.slice(0, 300)}…` : line),
});

const started = Date.now();
try {
  const workspace = await xcode.openWorkspace(resolve(project));
  const navigatorPath = await xcode.navigatorPath(workspace, sourcePath);
  const result = await xcode.renderPreview({ workspace, navigatorPath, index: Number(index), timeoutSeconds: 300 });
  console.log({
    displayName: result.displayName,
    snapshot: result.snapshot?.path,
    destination: result.renderedDestination?.deviceModelName,
    displayModes: result.supportedOverrides.displayModes,
    localizations: result.supportedOverrides.localizations,
    variants: Object.keys(result.supportedOverrides.previewVariants),
    canvasControls: result.supportedOverrides.canvasControls,
    errors: result.errors,
  });
} catch (error) {
  console.error("Failed:", summarizeError(messageOf(error)));
  process.exitCode = 1;
} finally {
  console.log(`Took ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await xcode.close();
}
