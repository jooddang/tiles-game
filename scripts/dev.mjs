import { spawn, spawnSync } from "node:child_process";
import os from "node:os";

const port = "5173";
const extraArgs = process.argv.slice(2);
const tailscaleIp = findTailscaleIp();

console.log("");
console.log("Tile Puzzle dev server");
console.log(`  Local:     http://localhost:${port}/`);

if (tailscaleIp) {
  console.log(`  Tailscale: http://${tailscaleIp}:${port}/`);
} else {
  console.log("  Tailscale: not detected. Run `tailscale ip -4` to check this machine.");
}

console.log("");

const vite = spawn(
  "vite",
  ["--host", "0.0.0.0", "--port", port, ...extraArgs],
  {
    shell: true,
    stdio: "inherit",
  },
);

vite.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

function findTailscaleIp() {
  const commandResult = spawnSync("tailscale", ["ip", "-4"], {
    encoding: "utf8",
  });

  const commandIp = commandResult.stdout.trim().split(/\s+/).find(isTailscaleIp);
  if (commandIp) {
    return commandIp;
  }

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && isTailscaleIp(address.address)) {
        return address.address;
      }
    }
  }

  return undefined;
}

function isTailscaleIp(value) {
  return /^100\.(6[4-9]|[78]\d|9[0-9]|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(
    value,
  );
}
