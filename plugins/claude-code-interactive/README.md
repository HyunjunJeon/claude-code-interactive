# Claude Code Interactive for Codex

This Codex plugin runs the installed `claude` CLI inside a detached tmux PTY. Codex controls it by invoking a bundled local CLI script through its shell. No MCP server is used.

## Requirements

- Claude Code CLI available as `claude`
- tmux available as `tmux`
- Node.js 20 or newer
- Claude Code authentication already configured on the machine

## CLI

| Command | Purpose |
| --- | --- |
| `start` | Start or resume an interactive Claude Code session |
| `send` | Paste a prompt and optionally submit it |
| `key` | Operate approval and selection UI with safe keys |
| `read` | Capture normalized terminal output |
| `list` | List plugin-owned sessions |
| `stop` | End a session |

```bash
node scripts/claude-session.mjs start --cwd "$PWD" --permission-mode manual
node scripts/claude-session.mjs send --session <id> --text "Run pwd and report the result"
node scripts/claude-session.mjs read --session <id> --wait-ms 5000
node scripts/claude-session.mjs stop --session <id>
```

The plugin deliberately does not expose `--dangerously-skip-permissions` or `bypassPermissions`.

## Validation

```bash
node scripts/claude-session.mjs help
node scripts/cli-smoke-test.mjs
node scripts/smoke-test.mjs
```
