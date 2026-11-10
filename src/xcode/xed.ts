import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { xcodeEnv } from "./setup.ts";

const run = promisify(execFile);

/**
 * Opens a file in the Xcode GUI with `xed`, selecting `line`. Opens `project` first when given,
 * so the file shows up inside it and Xcode's canvas can build its previews.
 */
export async function openInXcode(options: {
  file: string;
  line: number | undefined;
  project: string | undefined;
  developerDir: string | undefined;
}): Promise<void> {
  const { file, line, project, developerDir } = options;
  // xed applies --line to the last file it opens.
  const args = [...(line ? ["--line", String(line)] : []), ...(project ? [project] : []), file];
  await run("/usr/bin/xed", args, { env: xcodeEnv(developerDir), timeout: 30_000 });
}
