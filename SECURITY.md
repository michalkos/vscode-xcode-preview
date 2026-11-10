# Security policy

## Supported versions

Only the latest release gets security fixes.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub instead:
[Report a vulnerability](https://github.com/michalkos/vscode-xcode-preview/security/advisories/new).

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get a reply within a week, and a fix or a plan soon after.

## What's in scope

Rendering a preview makes Xcode build and run code from the open project, so the extension only runs in trusted VS Code workspaces. Things worth reporting include:

- Running code or commands without the workspace being trusted
- The preview panel loading remote content or running scripts it shouldn't
- The extension calling Xcode tools beyond the ones it documents (open workspace, find files, list and switch schemes, render preview), or with arguments a project file can control in unexpected ways

Problems in Xcode itself, or in its headless MCP server, should go to Apple through [Feedback Assistant](https://feedbackassistant.apple.com).
