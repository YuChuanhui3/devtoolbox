import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  openSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { prepareLocalFrontend } from "./hoppscotch-local-prepare.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const cache = `${root}.cache/hoppscotch/`;
const pidfile = `${cache}server.pid`;
const action = process.argv[2] || "up";
function docker(args) {
  const r = spawnSync("docker", args, { stdio: "inherit" });
  if (r.status !== 0) throw Error("Could not extract official frontend image");
}
function setup() {
  mkdirSync(cache, { recursive: true });
  if (!existsSync(`${cache}index.html`)) {
    const lock = JSON.parse(
      readFileSync(`${root}integrations/hoppscotch/upstream.lock.json`, "utf8"),
    );
    const name = `devtoolbox-client-extract-${process.pid}`;
    docker(["create", "--name", name, lock.image]);
    try {
      docker(["cp", `${name}:/site/selfhost-web/.`, cache]);
    } finally {
      docker(["rm", name]);
    }
  }
  prepareLocalFrontend(cache);
  copyFileSync(
    `${root}integrations/hoppscotch/local-only.js`,
    `${cache}local-only.js`,
  );
}
async function running() {
  try {
    const response = await fetch("http://127.0.0.1:3173/__local/status", {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok && (await response.json()).localOnly === true;
  } catch {
    return false;
  }
}
try {
  if (action === "setup") setup();
  else if (action === "up") {
    setup();
    if (!(await running())) {
      const log = openSync(`${cache}server.log`, "a");
      const child = spawn(
        process.execPath,
        [`${root}scripts/hoppscotch-local-server.mjs`],
        { detached: true, stdio: ["ignore", log, log] },
      );
      writeFileSync(pidfile, String(child.pid));
      child.unref();
      for (let i = 0; i < 30 && !(await running()); i++)
        await new Promise((r) => setTimeout(r, 100));
      if (!(await running()))
        throw Error(
          "Static client could not start; check port 3173 and .cache/hoppscotch/server.log",
        );
    }
    console.log(
      "Local-only API client: http://127.0.0.1:3173 (no backend, database or accounts)",
    );
  } else if (action === "stop") {
    if ((await running()) && existsSync(pidfile))
      process.kill(Number(readFileSync(pidfile, "utf8")));
  } else if (action === "status")
    console.log(
      (await running()) ? "Local frontend running" : "Local frontend stopped",
    );
  else if (action === "logs")
    console.log(
      existsSync(`${cache}server.log`)
        ? readFileSync(`${cache}server.log`, "utf8")
        : "No logs",
    );
  else throw Error(`Unknown action: ${action}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
