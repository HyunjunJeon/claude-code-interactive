#!/usr/bin/env node
import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const script = new URL("./claude-session.mjs", import.meta.url).pathname;
const temp = await mkdtemp(path.join(tmpdir(), "claude-cli-test-"));
const fakeClaude = path.join(temp, "claude");
await writeFile(fakeClaude, "#!/bin/sh\necho READY\nwhile IFS= read -r line; do echo RECEIVED:$line; done\n");
await chmod(fakeClaude, 0o755);
const env = { ...process.env, CLAUDE_BIN: fakeClaude };
let id;

async function call(args) {
  const { stdout } = await exec(process.execPath, [script, ...args], { env });
  return JSON.parse(stdout);
}

try {
  const started = await call(["start", "--cwd", temp]);
  id = started.session_id;
  if (!started.output.includes("READY")) throw new Error("CLI start did not capture the PTY");
  const sent = await call(["send", "--session", id, "--text", "hello", "--wait-ms", "2000"]);
  if (!sent.output.includes("RECEIVED:hello")) throw new Error("CLI send did not reach the PTY");
  const listed = await call(["list"]);
  if (!listed.sessions.some((session) => session.session_id === id)) throw new Error("CLI list missed the session");
  const stopped = await call(["stop", "--session", id]);
  id = undefined;
  if (!stopped.stopped) throw new Error("CLI stop failed");
  process.stdout.write("CLI smoke test passed\n");
} finally {
  if (id) await call(["stop", "--session", id]).catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
