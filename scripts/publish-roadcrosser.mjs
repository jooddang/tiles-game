import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PUBLISH_PATHS,
  findUnrelatedPaths,
  parsePorcelainV1Z,
} from "./roadcrosser-publish-safety.mjs";

const force = process.argv.includes("--force");
const roadcrosserRoot = resolve(process.env.ROADCROSSER_ROOT ?? "../roadcrosser");
const pushedRefs = readStdin().trim().split("\n").filter(Boolean);

if (!force && pushedRefs.length === 0) {
  console.log("Skipping roadcrosser sync because no pushed refs were provided.");
  process.exit(0);
}

if (!force) {
  const pushedMain = pushedRefs.some((line) => {
    const [localRef, localSha, remoteRef] = line.trim().split(/\s+/);
    return (
      localRef === "refs/heads/main" &&
      remoteRef === "refs/heads/main" &&
      localSha &&
      !/^0+$/.test(localSha)
    );
  });

  if (!pushedMain) {
    console.log("Skipping roadcrosser sync because this push did not update main.");
    process.exit(0);
  }
}

if (!existsSync(resolve(roadcrosserRoot, "package.json"))) {
  throw new Error(`Cannot find roadcrosser repo at ${roadcrosserRoot}`);
}

const roadcrosserBranch = runCapture("git", ["branch", "--show-current"], roadcrosserRoot);
if (roadcrosserBranch !== "master") {
  throw new Error(
    `Refusing to sync roadcrosser because ${roadcrosserRoot} is on ${roadcrosserBranch || "detached HEAD"}, not master.`,
  );
}

const initialRoadcrosserStatus = getRoadcrosserStatus();
const initialUnrelatedChanges = findUnrelatedPaths(initialRoadcrosserStatus);
if (initialUnrelatedChanges.length > 0) {
  printUnrelatedChanges(initialUnrelatedChanges);
  process.exit(1);
}

const tilesGameSha = runCapture("git", ["rev-parse", "--short", "HEAD"], process.cwd());

run("npm", ["run", "sync:tiles-game:leaderboard"], roadcrosserRoot);

const status = getRoadcrosserStatus();

if (status.length === 0) {
  console.log("roadcrosser tiles-game snapshot is already current.");
  process.exit(0);
}

const unrelatedChanges = findUnrelatedPaths(status);

if (unrelatedChanges.length > 0) {
  printUnrelatedChanges(unrelatedChanges);
  process.exit(1);
}

maybeRunRoadcrosserBuild();

run("git", ["add", "--", ...PUBLISH_PATHS], roadcrosserRoot);
run(
  "git",
  [
    "commit",
    "--only",
    "-m",
    `Update tiles-game snapshot to ${tilesGameSha}`,
    "--",
    ...PUBLISH_PATHS,
  ],
  roadcrosserRoot,
);
run("git", ["push", "origin", "master"], roadcrosserRoot);

function getRoadcrosserStatus() {
  return parsePorcelainV1Z(
    runCaptureRaw(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      roadcrosserRoot,
    ),
  );
}

function printUnrelatedChanges(unrelatedChanges) {
  console.error("Refusing to auto-commit roadcrosser because it has unrelated changes:");
  for (const change of unrelatedChanges) {
    console.error(`  ${change}`);
  }
}

function maybeRunRoadcrosserBuild() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.log(
      "Skipping roadcrosser build because NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.",
    );
    return;
  }

  run("npm", ["run", "build"], roadcrosserRoot);
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
}

function runCapture(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function runCaptureRaw(command, args, cwd) {
  const result = spawnSync(command, args, { cwd });

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd}: ${result.stderr.toString()}`,
    );
  }

  return result.stdout;
}
