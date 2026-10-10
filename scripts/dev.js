// `npm run dev`: starts the mock API and the app's Vite dev server together.
//
// Why not `concurrently` or `npm-run-all`: two child processes don't justify a
// dependency. Both run straight through `node` (no shell), and if either one
// exits, the other is stopped too, so nothing is left holding a port.

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const viteBin = path.join(
  path.dirname(require.resolve("vite/package.json", { paths: [path.join(root, "app")] })),
  "bin",
  "vite.js",
);

const processes = [
  { name: "api", color: 36, args: [path.join(root, "scripts", "start-server.js")], cwd: root },
  { name: "app", color: 35, args: [viteBin], cwd: path.join(root, "app") },
];

const children = processes.map(({ name, color, args, cwd }) => {
  const child = spawn(process.execPath, args, { cwd, stdio: ["inherit", "pipe", "pipe"] });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let pending = "";
    stream.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) process.stdout.write(prefix + line + "\n");
    });
  }
  child.on("exit", (code) => {
    process.stdout.write(`${prefix}exited with code ${code}\n`);
    shutdown(code ?? 1);
  });
  return child;
});

function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    // Windows has no POSIX signals: child.kill() is TerminateProcess, which skips
    // start-server.js's cleanup and orphans the mock API binary. Kill the whole tree.
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM"); // start-server.js forwards this to the binary.
  }
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(stop);
  process.exitCode = code;
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => shutdown(0));
