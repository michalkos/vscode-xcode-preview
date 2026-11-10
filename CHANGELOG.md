# Changelog

All notable changes to Xcode Preview.

## [0.1.2](https://github.com/michalkos/vscode-xcode-preview/releases/tag/v0.1.2) - 2026-11-10

### Features

- Add interactive preview mode (#6) ([159e65c](https://github.com/michalkos/vscode-xcode-preview/commit/159e65c53de92094c3cceee9ee665f380cf71112))
- Add Export PNG and Open in Xcode buttons to the preview panel (#7) ([94725d0](https://github.com/michalkos/vscode-xcode-preview/commit/94725d0f04c67d8c27f48ae733d2bb50d5efe5b8))

### Documentation

- Add contributor guides, issue templates, CI and README screenshot ([0d40684](https://github.com/michalkos/vscode-xcode-preview/commit/0d406846e0f103b43ab9e0e1cb21b975e0bddce2))

## [0.1.1](https://github.com/michalkos/vscode-xcode-preview/releases/tag/v0.1.1) - 2026-11-10

### Changes

- Add extension icon ([37a29e6](https://github.com/michalkos/vscode-xcode-preview/commit/37a29e675765835088c9b0831766f535798bde69))

## [0.1.0](https://github.com/michalkos/vscode-xcode-preview/releases/tag/v0.1.0) - 2026-11-10

### Features

- Render SwiftUI `#Preview` and `PreviewProvider` previews in VS Code through Xcode 27's headless MCP server.
- **▶ Preview** links above each preview, and a tab for each preview in the panel.
- Re-render on save, following the active Swift editor.
- Device, language, color scheme, Dynamic Type, orientation and other Xcode variant pickers, plus `#Preview(arguments:)` items and widget timelines.
- Short build error summaries in the panel, with full logs in the Xcode Preview output.
- Commands to pick the Xcode project and scheme, and to check the headless setup.
