import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const initialUnrelatedChanges = initialRoadcrosserStatus.filter(isUnrelatedRoadcrosserChange);
if (initialUnrelatedChanges.length > 0) {
  printUnrelatedChanges(initialUnrelatedChanges);
  process.exit(1);
}

const tilesGameSha = runCapture("git", ["rev-parse", "--short", "HEAD"], process.cwd());

run("npm", ["run", "sync:tiles-game"], roadcrosserRoot);

const status = getRoadcrosserStatus();

if (status.length === 0) {
  console.log("roadcrosser tiles-game snapshot is already current.");
  process.exit(0);
}

const unrelatedChanges = status.filter(isUnrelatedRoadcrosserChange);

if (unrelatedChanges.length > 0) {
  printUnrelatedChanges(unrelatedChanges);
  process.exit(1);
}

maybeRunRoadcrosserBuild();

run("git", ["add", "public/games/tiles-game"], roadcrosserRoot);
run("git", ["commit", "-m", `Update tiles-game snapshot to ${tilesGameSha}`], roadcrosserRoot);
run("git", ["push", "origin", "master"], roadcrosserRoot);

function getRoadcrosserStatus() {
  return runCapture("git", ["status", "--porcelain"], roadcrosserRoot)
    .split("\n")
    .filter(Boolean);
}

function isUnrelatedRoadcrosserChange(line) {
  const filePath = line.slice(3);
  return !filePath.startsWith("public/games/tiles-game/");
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
