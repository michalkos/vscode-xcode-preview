# Developing Xcode Preview

How to build, run and test the extension on your Mac.

## Prerequisites

- macOS with **Xcode 27 or newer**, selected with `xcode-select` or pointed to by `DEVELOPER_DIR`.
- **Node 22.18 or newer.** The `render` script runs TypeScript directly with Node's built-in type stripping.
- **pnpm.**
- **VS Code 1.100 or newer.**
- **An Xcode project with SwiftUI previews** to test against.
- **Xcode's headless mode** turned on (once):

  ```sh
  sudo xcrun mcp-server enable
  ```

## Get started

```sh
pnpm install
pnpm check   # typecheck
pnpm test    # unit tests
pnpm build   # bundle into dist/
```

## Project layout

```
src/
  extension.ts      Activation and command registration
  controller.ts     Panel state: which file and preview, overrides, render-on-save
  codelens.ts       "▶ Preview" links above each preview declaration
  panel.ts          The webview panel and its security policy
  protocol.ts       Typed messages between the extension and the webview
  previews.ts       Finds #Preview / PreviewProvider declarations in Swift source
  project.ts        Finds the .xcodeproj/.xcworkspace and maps files to navigator paths
  errors.ts         Shortens Xcode's error output for display
  coalesce.ts       Runs renders one at a time, collapsing requests that arrive mid-render
  xcode/
    client.ts       Typed MCP client for Xcode's tools (no VS Code dependency)
    schemas.ts      zod schemas for Xcode's tool results
    setup.ts        `mcp-server status` and setup guidance
  webview/main.ts   Panel UI (plain DOM)
media/webview.css   Panel styles, using VS Code theme variables
scripts/render.ts   Command-line renderer for debugging the Xcode side
test/               Unit tests (vitest)
```

The `vscode` module is only imported by `extension.ts`, `controller.ts`, `codelens.ts` and `panel.ts`. Everything else runs in plain Node, which keeps it easy to test.

## Test the Xcode side without VS Code

`scripts/render.ts` drives the same `XcodeClient` the extension uses and prints what Xcode returns:

```sh
pnpm render "/path/to/App.xcodeproj" "/path/to/App/Views/ContentView.swift"
pnpm render "/path/to/App.xcodeproj" "/path/to/App/Views/ContentView.swift" 1   # second preview in the file
```

It prints the previews it found in the file, each Xcode tool call, the snapshot path, the available overrides and the elapsed time. Open the snapshot with `open "<path>"`.

Xcode treats `node` as its own agent, separate from VS Code, so it needs its own approval the first time (see [Approvals](#approvals)).

## Run the extension in VS Code

### Option A: debug with F5

1. Open this folder in VS Code.
2. Start the bundler in watch mode and leave it running:

   ```sh
   pnpm watch
   ```

3. Press **F5** (Run Extension). An Extension Development Host window opens with the extension loaded.
4. In that window, open a folder that contains an Xcode project, open a Swift file with a preview, and click **▶ Preview** above it.
5. After a code change, wait for the watch build, then run **Developer: Reload Window** in the host window.

Breakpoints in `src/` work, because the watch build writes source maps.

To open a project automatically every time, add its path to `args` in `.vscode/launch.json`. Keep that change local:

```json
"args": ["--extensionDevelopmentPath=${workspaceFolder}", "/path/to/your/app"]
```

### Option B: an isolated VS Code profile

This keeps test runs away from your everyday settings and extensions:

```sh
pnpm build
code --user-data-dir /tmp/xcode-preview-test --extensions-dir /tmp/xcode-preview-test-ext \
  --extensionDevelopmentPath="$PWD" "/path/to/your/app"
```

### Option C: install the packaged build

This is closest to what users get:

```sh
pnpm package
code --install-extension xcode-preview-0.1.0.vsix
```

To uninstall it afterwards:

```sh
code --uninstall-extension kos-codes.xcode-preview
```

## Approvals

Headless Xcode asks before any new agent or project folder can use it. VS Code (including the Extension Development Host) and `node` (for `pnpm render`) count as separate agents. When a preview fails with a connection or permission error:

```sh
xcrun mcp-server status                              # shows pending requests and their ids
sudo xcrun mcp-server approve <id> --always          # or --for-24-hours
```

To start over from scratch:

```sh
sudo xcrun mcp-server clear-permissions
```

**Xcode Preview: Check Setup** prints the same status in the Output panel.

## Debugging

- **Extension log:** View › Output › **Xcode Preview** shows every Xcode tool call with its arguments, Xcode's stderr, and full error text. Set the log level to Trace with the gear icon if needed.
- **Webview:** run **Developer: Open Webview Developer Tools** while the preview panel is focused.
- **Xcode's activity log:**

  ```sh
  xcrun mcp-server show-logs
  ```

- **Restart the headless server:**

  ```sh
  xcrun mcp-server stop
  ```

  It starts again on the next connection.

## Common problems

| Symptom | Cause |
| --- | --- |
| `SourceContainsNoPreviewsError` | The previews are commented out or behind a macro Xcode doesn't see. The extension's scanner should agree; if it doesn't, add a test case in `test/previews.test.ts`. |
| `CompileDylibError` / `ambiguous use of '__designTimeSelection'` | Xcode's preview build failed for that file. Check whether the same preview works in Xcode's canvas. It's often an Xcode issue, not an extension bug. |
| "isn't in this Xcode project" | The file isn't in the project navigator (target membership), or the wrong project was picked. Use **Select Xcode Project or Workspace**. |
| First render takes minutes | Xcode builds the whole scheme first. Later renders take seconds. Raise `xcodePreview.renderTimeout` for big projects. |
| Preview builds the wrong target | Pick the right scheme with **Select Scheme**. |

## Tests

```sh
pnpm test                 # run once
pnpm exec vitest          # watch mode
```

Unit tests cover the parts that are easy to get subtly wrong: preview detection, project and navigator-path matching, error summaries and render coalescing. Anything that needs Xcode is checked by hand with `pnpm render` and the steps above.

Before opening a pull request:

```sh
pnpm check && pnpm test && pnpm build
```

## Releasing

`CHANGELOG.md` is generated from commit messages by [git-cliff](https://git-cliff.org), configured in `cliff.toml`. Use [conventional commits](https://www.conventionalcommits.org) so changes land in the right section:

| Prefix | Changelog section |
| --- | --- |
| `feat:` | Features |
| `fix:` | Fixes |
| `perf:` | Performance |
| `docs:` | Documentation |
| `chore:`, `ci:`, `build:`, `test:`, `refactor:`, `style:` | Left out |
| anything else | Changes |

To cut a release:

```sh
pnpm changelog          # preview the next section
pnpm release minor      # or patch / major: bumps, writes CHANGELOG.md, commits and tags
git push --follow-tags  # the tag runs .github/workflows/release.yml
```

The Release workflow typechecks, tests and packages the extension, then creates a GitHub Release with the `.vsix` attached and the version's changelog section as notes. It fails if the tag doesn't match the `package.json` version or if `CHANGELOG.md` has no section for it.
