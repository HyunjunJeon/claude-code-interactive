# Claude Code Interactive for Codex

Control a real Claude Code interactive CLI session from Codex without an MCP server.

The plugin launches `claude` in a detached tmux PTY and gives Codex a local CLI for starting sessions, sending prompts, operating approval screens, reading terminal output, and stopping sessions.

## Install

```bash
codex plugin marketplace add HyunjunJeon/claude-code-interactive
codex plugin add claude-code-interactive@hyunjunjeon
```

Start a new Codex task after installation so the skill is loaded.

## Requirements

- Codex CLI with plugin support
- Claude Code CLI available as `claude`
- Claude Code authentication already configured
- tmux 3.x
- Node.js 20 or newer
- macOS or Linux

## Usage

Ask Codex naturally:

```text
Start Claude Code in this project and ask it to review the current changes.
```

Codex follows the bundled skill and invokes:

```text
Codex shell -> claude-session.mjs -> tmux PTY -> claude CLI
```

No MCP server or Anthropic API key proxy is involved. Claude Code uses the authentication already configured on the local machine.

## Safety

- Permission mode defaults to `manual`.
- `--dangerously-skip-permissions` and `bypassPermissions` are not exposed.
- Only a fixed set of terminal interaction keys is accepted.
- Session IDs are validated before they are passed to tmux.
- Terminal output is stripped of ANSI control sequences and size-limited.
- Codex remains responsible for reviewing changes and running final verification.

## Development

```bash
cd plugins/claude-code-interactive
node scripts/claude-session.mjs help
node scripts/cli-smoke-test.mjs
node scripts/smoke-test.mjs
```

The smoke tests use a fake Claude executable, so they do not require an Anthropic request or consume model tokens.

## License

[MIT](LICENSE)
