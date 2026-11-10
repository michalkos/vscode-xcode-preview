// Bundles the extension host code and the webview script.
// Usage: node esbuild.mjs [--production] [--watch]
import { context } from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const shared = { bundle: true, minify: production, sourcemap: !production, logLevel: "info" };

const builds = [
  {
    ...shared,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.cjs",
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["vscode"],
  },
  {
    ...shared,
    entryPoints: ["src/webview/main.ts"],
    outfile: "dist/webview.js",
    platform: "browser",
    format: "iife",
    target: "es2022",
  },
];

const contexts = await Promise.all(builds.map((options) => context(options)));
if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
