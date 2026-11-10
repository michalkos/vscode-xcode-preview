# Changelog

All notable changes to Xcode Preview.

## [0.1.0](https://github.com/michalkos/vscode-xcode-preview/releases/tag/v0.1.0) - 2026-11-10

### Features

- Render SwiftUI `#Preview` and `PreviewProvider` previews in VS Code through Xcode 27's headless MCP server.
- **▶ Preview** links above each preview, and a tab for each preview in the panel.
- Re-render on save, following the active Swift editor.
- Device, language, color scheme, Dynamic Type, orientation and other Xcode variant pickers, plus `#Preview(arguments:)` items and widget timelines.
- Short build error summaries in the panel, with full logs in the Xcode Preview output.
- Commands to pick the Xcode project and scheme, and to check the headless setup.
