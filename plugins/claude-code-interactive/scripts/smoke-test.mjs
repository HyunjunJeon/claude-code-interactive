#!/usr/bin/env node
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ClaudeSessionController } from "../server/session-controller.mjs";

const temp = await mkdtemp(path.join(tmpdir(), "claude-interactive-test-"));
const fakeClaude = path.join(temp, "claude");
await writeFile(fakeClaude, "#!/bin/sh\necho READY\nwhile IFS= read -r line; do echo RECEIVED:$line; done\n");
await chmod(fakeClaude, 0o755);

const controller = new ClaudeSessionController({ claudeBin: fakeClaude });
let id;
try {
  const started = await controller.start({ cwd: temp });
  id = started.session_id;
  if (!started.output.includes("READY")) throw new Error(`missing READY output: ${started.output}`);
  const sent = await controller.send(id, "hello from codex", { wait_ms: 3000 });
  if (!sent.output.includes("RECEIVED:hello from codex")) throw new Error(`missing echoed input: ${sent.output}`);
  const sessions = await controller.list();
  if (!sessions.some((session) => session.session_id === id)) throw new Error("started session was not listed");
  process.stdout.write("controller smoke test passed\n");
} finally {
  if (id && await controller.exists(id)) await controller.stop(id);
  await rm(temp, { recursive: true, force: true });
}
