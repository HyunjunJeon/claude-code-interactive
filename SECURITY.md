# Security Policy

## Reporting

Please report security issues privately through GitHub Security Advisories instead of opening a public issue.

## Security Model

This plugin controls a locally authenticated Claude Code process. It does not collect or transmit credentials itself. Users should review Claude Code permission prompts and avoid sending secrets as command-line arguments.

Permission bypass modes are intentionally unsupported. The plugin does not replace Codex or Claude Code sandboxing, approval, and repository trust controls.
