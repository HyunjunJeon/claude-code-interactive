import { randomUUID } from "node:crypto";
import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";

const SESSION_PREFIX = "codex-claude-";
const SAFE_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const PERMISSION_MODES = new Set(["manual", "plan", "acceptEdits", "dontAsk", "auto"]);
const SAFE_KEYS = new Set([
  "Enter", "Escape", "Up", "Down", "Left", "Right", "Tab", "Space",
  "BSpace", "DC", "Home", "End", "PageUp", "PageDown", "C-c", "C-d", "C-u",
]);

function run(command, args, { input, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: env ? { ...process.env, ...env } : process.env,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = {
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (result.code === 0) resolve(result);
      else reject(new Error(`${command} exited ${result.code}: ${result.stderr.trim()}`));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function normalizeId(id) {
  if (!SAFE_ID.test(id)) throw new Error("session_id must contain only letters, digits, '_' or '-'");
  return id.startsWith(SESSION_PREFIX) ? id : `${SESSION_PREFIX}${id}`;
}

function publicId(tmuxName) {
  return tmuxName.startsWith(SESSION_PREFIX) ? tmuxName.slice(SESSION_PREFIX.length) : tmuxName;
}

function cleanOutput(value, maxChars) {
  const withoutAnsi = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/[^\n\t\x20-\x7E\u00A0-\uFFFF]/g, "");
  return withoutAnsi.length > maxChars ? withoutAnsi.slice(-maxChars) : withoutAnsi;
}

async function requireDirectory(cwd) {
  if (!cwd || typeof cwd !== "string") throw new Error("cwd is required");
  await access(cwd, constants.R_OK | constants.X_OK);
  if (!(await stat(cwd)).isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);
}

export class ClaudeSessionController {
  constructor({ tmuxBin = process.env.TMUX_BIN || "tmux", claudeBin = process.env.CLAUDE_BIN || "claude" } = {}) {
    this.tmuxBin = tmuxBin;
    this.claudeBin = claudeBin;
    this.maxOutput = Math.min(Number(process.env.CLAUDE_INTERACTIVE_MAX_OUTPUT) || 24000, 100000);
  }

  async start({ cwd, prompt, permission_mode = "manual", model, resume_session_id } = {}) {
    await requireDirectory(cwd);
    if (!PERMISSION_MODES.has(permission_mode)) {
      throw new Error(`permission_mode must be one of: ${[...PERMISSION_MODES].join(", ")}`);
    }
    if (resume_session_id && typeof resume_session_id !== "string") {
      throw new Error("resume_session_id must be a Claude conversation ID string");
    }

    const id = randomUUID();
    const tmuxName = normalizeId(id);
    const args = ["--ax-screen-reader", "--permission-mode", permission_mode, "--name", `Codex ${id.slice(0, 8)}`];
    if (model) args.push("--model", String(model));
    if (resume_session_id) args.push("--resume", resume_session_id);
    if (prompt) args.push(String(prompt));

    const command = [this.claudeBin, ...args].map(shellQuote).join(" ");
    await run(this.tmuxBin, ["new-session", "-d", "-s", tmuxName, "-c", cwd, command]);
    await this.waitForChange(id, "", 8000);
    await new Promise((resolve) => setTimeout(resolve, 800));
    return { session_id: id, cwd, permission_mode, output: await this.read(id) };
  }

  async list() {
    let result;
    try {
      result = await run(this.tmuxBin, ["list-sessions", "-F", "#{session_name}\t#{session_path}\t#{session_created}"]);
    } catch (error) {
      if (String(error.message).includes("no server running")) return [];
      throw error;
    }
    return result.stdout.trim().split("\n").filter(Boolean).flatMap((line) => {
      const [name, cwd, created] = line.split("\t");
      return name.startsWith(SESSION_PREFIX)
        ? [{ session_id: publicId(name), cwd, created_at_unix: Number(created) }]
        : [];
    });
  }

  async exists(id) {
    try {
      await run(this.tmuxBin, ["has-session", "-t", normalizeId(id)]);
      return true;
    } catch {
      return false;
    }
  }

  async read(id, { wait_ms = 0, previous_output = "" } = {}) {
    if (wait_ms > 0 && previous_output) {
      await this.waitForChange(id, previous_output, Math.min(wait_ms, 60000));
    } else if (wait_ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait_ms, 60000)));
    }
    const result = await run(this.tmuxBin, ["capture-pane", "-p", "-J", "-S", "-2000", "-t", normalizeId(id)]);
    return cleanOutput(result.stdout, this.maxOutput).trimEnd();
  }

  async send(id, text, { submit = true, wait_ms = 1500 } = {}) {
    if (typeof text !== "string" || text.length === 0) throw new Error("text must be a non-empty string");
    if (text.length > 50000) throw new Error("text exceeds the 50,000 character limit");
    const before = await this.read(id);
    const buffer = `codex-${randomUUID()}`;
    await run(this.tmuxBin, ["load-buffer", "-b", buffer, "-"], { input: text });
    await run(this.tmuxBin, ["paste-buffer", "-d", "-b", buffer, "-t", normalizeId(id)]);
    if (submit) await this.key(id, "Enter");
    const output = await this.read(id, { wait_ms: Math.min(wait_ms, 60000), previous_output: before });
    return { session_id: publicId(normalizeId(id)), submitted: submit, output };
  }

  async key(id, key) {
    if (!SAFE_KEYS.has(key)) throw new Error(`unsupported key: ${key}`);
    await run(this.tmuxBin, ["send-keys", "-t", normalizeId(id), key]);
    return { session_id: publicId(normalizeId(id)), key };
  }

  async stop(id) {
    await run(this.tmuxBin, ["kill-session", "-t", normalizeId(id)]);
    return { session_id: publicId(normalizeId(id)), stopped: true };
  }

  async waitForChange(id, previousOutput, waitMs) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const current = await this.read(id);
        if (current && current !== previousOutput) return current;
      } catch {
        return "";
      }
    }
    return previousOutput;
  }
}
