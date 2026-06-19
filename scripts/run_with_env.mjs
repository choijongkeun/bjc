import { spawn } from "node:child_process";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const separatorIndex = args.indexOf("--");

if (separatorIndex === -1 || separatorIndex === args.length - 1) {
  fail("usage: node scripts/run_with_env.mjs KEY=value [KEY=value ...] -- <command> [args...]");
}

const envAssignments = args.slice(0, separatorIndex);
const command = args[separatorIndex + 1];
const commandArgs = args.slice(separatorIndex + 2);
const env = { ...process.env };

for (const assignment of envAssignments) {
  const equalsIndex = assignment.indexOf("=");
  if (equalsIndex <= 0) {
    fail(`invalid env assignment: ${assignment}`);
  }
  const key = assignment.slice(0, equalsIndex);
  const value = assignment.slice(equalsIndex + 1);
  env[key] = value;
}

const child = spawn(command, commandArgs, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  fail(error.message);
});
