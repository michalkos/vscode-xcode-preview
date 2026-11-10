import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { HeadlessStatus } from "./schemas.ts";

const run = promisify(execFile);

/** Turns the `developerDir` setting (an `Xcode.app` or its `Contents/Developer`) into a DEVELOPER_DIR value. */
export function resolveDeveloperDir(setting: string): string | undefined {
  const path = setting.trim();
  if (!path) return undefined;
  return path.endsWith(".app") || path.endsWith(".app/") ? join(path, "Contents", "Developer") : path;
}

/** Reads the state of Xcode's headless MCP server and returns it along with a human-readable report. */
export async function headlessStatus(developerDir: string | undefined) {
  const options = {
    env: { ...process.env, ...(developerDir ? { DEVELOPER_DIR: developerDir } : {}) },
    timeout: 15_000,
  };
  try {
    const [json, text] = await Promise.all([
      run("/usr/bin/xcrun", ["mcp-server", "status", "--format", "json"], options),
      run("/usr/bin/xcrun", ["mcp-server", "status"], options),
    ]);
    const status = HeadlessStatus.parse(JSON.parse(json.stdout));
    return { enabled: status.permission.enabled, running: status.running, report: text.stdout.trim() };
  } catch (error) {
    throw new Error(
      "Couldn't run `xcrun mcp-server status`. Xcode Preview needs Xcode 27 or newer; " +
        `select it with xcode-select or the xcodePreview.developerDir setting.\n${String(error)}`,
    );
  }
}

/** Step-by-step instructions for the one-time setup, shown by the Check Setup command. */
export function setupGuide(enabled: boolean): string[] {
  return [
    enabled ? "✓ Headless mode is on." : "1. Turn on Xcode's headless mode (once):\n     sudo xcrun mcp-server enable",
    "2. Open a preview. Xcode asks to approve VS Code and your project folder the first time.",
    "   Find the pending request ids with:\n     xcrun mcp-server status",
    "   Then approve each one:\n     sudo xcrun mcp-server approve <id> --always",
    "3. Run “Xcode Preview: Refresh Preview”.",
  ];
}
