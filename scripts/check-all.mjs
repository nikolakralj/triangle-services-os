// Every offline check in scripts/check-*.mjs, one after the other.
// No env, no live database, no message sent. Exit 1 when any check fails.
// Run before every pull request: `npm run check:all`. CI runs it too.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dir = path.join(root, "scripts");
const files = fs
  .readdirSync(dir)
  .filter((name) => /^check-.+\.mjs$/.test(name) && name !== "check-all.mjs")
  .sort();

const failed = [];
for (const name of files) {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join("scripts", name)], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 5 * 60 * 1000,
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const last = output
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .pop();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = run.status === 0;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name.padEnd(30)} ${seconds.padStart(5)}s  ${last ?? ""}`);
  if (!ok) failed.push({ name, output });
}

for (const { name, output } of failed) {
  console.log(`\n--- ${name}`);
  console.log(
    output
      .split(/\r?\n/)
      .filter((line) => /^FAIL|Error|assert/i.test(line))
      .slice(0, 12)
      .join("\n"),
  );
}

console.log(
  failed.length === 0
    ? `\n${files.length}/${files.length} check files passed`
    : `\n${files.length - failed.length}/${files.length} check files passed`,
);
process.exit(failed.length === 0 ? 0 : 1);
