#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { ClaudeSessionController } from "../server/session-controller.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const key = token.slice(2).replaceAll("-", "_");
    if (["submit", "no_submit"].includes(key)) {
      options.submit = key === "submit";
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for ${token}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  if (!options[key]) throw new Error(`--${key.replaceAll("_", "-")} is required`);
  return options[key];
}

async function stdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function optionalText(options, key) {
  if (options[`${key}_file`]) return readFile(options[`${key}_file`], "utf8");
  if (options[`${key}_stdin`] === "true") return stdinText();
  return options[key];
}

function help() {
  return `Claude Code interactive session controller

Usage:
  claude-session.mjs start --cwd <path> [--prompt <text>] [--permission-mode manual]
  claude-session.mjs send --session <id> --text <text> [--wait-ms 1500] [--no-submit]
  claude-session.mjs read --session <id> [--wait-ms 0]
  claude-session.mjs key --session <id> --key <key>
  claude-session.mjs list
  claude-session.mjs stop --session <id>

Long prompts may be supplied with --prompt-file/--text-file or with
--prompt-stdin true/--text-stdin true. Output is JSON.`;
}

const controller = new ClaudeSessionController();

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "start":
      return controller.start({
        cwd: required(options, "cwd"),
        prompt: await optionalText(options, "prompt"),
        permission_mode: options.permission_mode || "manual",
        model: options.model,
        resume_session_id: options.resume_session_id,
      });
    case "send":
      return controller.send(required(options, "session"), required({ text: await optionalText(options, "text") }, "text"), {
        submit: options.submit ?? true,
        wait_ms: Number(options.wait_ms ?? 1500),
      });
    case "read":
      return {
        session_id: required(options, "session"),
        output: await controller.read(options.session, { wait_ms: Number(options.wait_ms ?? 0) }),
      };
    case "key":
      return controller.key(required(options, "session"), required(options, "key"));
    case "list":
      return { sessions: await controller.list() };
    case "stop":
      return controller.stop(required(options, "session"));
    case "help":
    case "--help":
    case undefined:
      return { help: help() };
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

try {
  process.stdout.write(`${JSON.stringify(await main(), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message || String(error) })}\n`);
  process.exitCode = 1;
}
