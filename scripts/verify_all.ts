import { spawn, type ChildProcess } from "node:child_process";

async function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}`));
    });
    child.on("error", reject);
  });
}

function startApiServer(): ChildProcess {
  return spawn("node", ["dist/src/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BJC_API_PORT: "3011"
    },
    stdio: "inherit",
    shell: false,
  });
}

async function stopServer(server: ChildProcess) {
  if (!server.pid) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    server.once("exit", finish);
    server.kill("SIGTERM");

    setTimeout(() => {
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
      finish();
    }, 5_000);
  });
}

async function waitForReady(url: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = (await response.json()) as { ok?: boolean; service?: string; database?: string };
        if (payload.ok === true && payload.service === "bjc-api" && payload.database === "ready") {
          return;
        }
      }
    } catch {
      // keep polling until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for readiness: ${url}`);
}

async function main() {
  let server: ChildProcess | null = null;
  try {
    await run("npm", ["run", "test:all"]);
    await run("npm", ["run", "build:all"]);

    server = startApiServer();
    await waitForReady("http://127.0.0.1:3011/ready", 30_000);

    await run("node", ["scripts/run_with_env.mjs", "BJC_SMOKE_BASE_URL=http://127.0.0.1:3011", "--", "npm", "run", "preflight:smoke"]);
    await run("node", ["scripts/run_with_env.mjs", "BJC_SMOKE_BASE_URL=http://127.0.0.1:3011", "--", "npm", "run", "smoke:all"]);

    await stopServer(server);
    server = null;

    await run("npm", ["run", "e2e"]);
  } finally {
    if (server) {
      await stopServer(server);
    }
  }
}

await main();
