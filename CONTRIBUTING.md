# Contributing

Thanks for helping out! Bug reports, ideas and pull requests are all welcome.

## Ideas and questions

Start a thread in [Discussions](https://github.com/michalkos/vscode-xcode-preview/discussions). Issues are for bugs and agreed-on work.

## Reporting a bug

Use the bug report template. The most useful things to include:

- macOS, Xcode, VS Code and extension versions
- The **Xcode Preview** output (View › Output › Xcode Preview)
- The output of `xcrun mcp-server status`
- Whether the same preview renders in Xcode's own canvas

## Making a change

You need macOS with Xcode 27 or newer, Node 22.18+ and pnpm. [DEVELOPMENT.md](DEVELOPMENT.md) covers setup, running the extension locally and debugging.

1. For anything bigger than a small fix, open an issue or discussion first so we can agree on the approach.
2. Fork the repo and create a branch.
3. Make your change. Keep it focused, and add a test when you change logic in `src/` that doesn't need VS Code or Xcode.
4. Check it:

   ```sh
   pnpm check && pnpm test && pnpm build
   ```

   For changes that affect rendering, also try a real preview with `pnpm render` or the Extension Development Host.

5. Open a pull request. CI runs the same checks.

## Pull request titles

Pull requests are squash-merged, and the PR title becomes the commit message that the changelog is generated from. Use a [conventional commit](https://www.conventionalcommits.org) title:

- `feat: export the preview as PNG`
- `fix: keep the selected device after switching files`
- `docs: explain approvals for the render script`
- `chore: …`, `ci: …`, `refactor: …`, `test: …` for changes that don't need a changelog entry

## Code style

- TypeScript with strict settings. Avoid `any`, and let types be inferred where they can.
- Keep modules that don't need VS Code free of the `vscode` import, so they stay easy to test.
- Prefer small, plain code over abstractions. Comment why, not what.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
