import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

/**
 * Walks up from a Swift file towards `root` and returns the Xcode containers in the nearest
 * folder that has any. Workspaces win over projects in the same folder, since a workspace
 * (CocoaPods, multi-project setups) usually wraps the project beside it.
 */
export async function findNearbyContainers(
  file: string,
  root: string,
  list: (dir: string) => Promise<string[]> = readdir,
): Promise<string[]> {
  let dir = dirname(file);
  while (true) {
    const entries = await list(dir).catch(() => []);
    const workspaces = entries.filter((name) => name.endsWith(".xcworkspace"));
    const projects = entries.filter((name) => name.endsWith(".xcodeproj"));
    const found = workspaces.length ? workspaces : projects;
    if (found.length) return found.map((name) => join(dir, name)).sort();

    const parent = dirname(dir);
    if (parent === dir || relative(root, dir).startsWith("..") || dir === root) return [];
    dir = parent;
  }
}

/**
 * Picks which of Xcode's project-navigator paths (from XcodeGlob) is the file on disk, by the
 * longest run of matching trailing path segments. Navigator paths start with the project's
 * group names, which rarely match folder names one-to-one, so only the tail is compared.
 */
export function pickNavigatorPath(fsPath: string, navigatorPaths: string[]): string | undefined {
  const target = fsPath.split(sep).reverse();
  let best: { path: string; score: number } | undefined;

  for (const path of navigatorPaths) {
    if (basename(path) !== basename(fsPath)) continue;
    const segments = path.split("/").reverse();
    let score = 0;
    while (score < segments.length && segments[score] === target[score]) score++;
    if (!best || score > best.score) best = { path, score };
  }
  return best?.path;
}
