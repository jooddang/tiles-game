import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  PUBLISH_PATHS,
  findUnrelatedPaths,
  parsePorcelainV1Z,
} from "../../scripts/roadcrosser-publish-safety.mjs";

test("pathscoped_commit_never_includes_an_unrelated_staged_edit", () => {
  const repository = createRepository({
    "public/games/tiles-game/index.html": "old game",
    "vendor/tiles-game-leaderboard/current-version.json": "{}",
    "notes.txt": "old notes",
  });
  write(repository, "public/games/tiles-game/index.html", "new game");
  write(
    repository,
    "vendor/tiles-game-leaderboard/v1/contract.json",
    '{"version":1}',
  );
  write(repository, "notes.txt", "new notes");
  git(repository, ["add", "notes.txt"]);
  git(repository, ["add", "--", ...PUBLISH_PATHS]);

  git(repository, [
    "commit",
    "--only",
    "-m",
    "publish",
    "--",
    ...PUBLISH_PATHS,
  ]);

  assert.deepEqual(
    git(repository, ["show", "--pretty=format:", "--name-only", "HEAD"])
      .trim()
      .split("\n"),
    [
      "public/games/tiles-game/index.html",
      "vendor/tiles-game-leaderboard/v1/contract.json",
    ],
  );
  assert.match(
    git(repository, ["status", "--porcelain"]),
    /^M {2}notes\.txt$/m,
  );
});

test("porcelain_parser_rejects_an_allowed_to_unrelated_rename", () => {
  const repository = createRepository({
    "public/games/tiles-game/index.html": "game",
  });
  git(repository, [
    "mv",
    "public/games/tiles-game/index.html",
    "unrelated.html",
  ]);

  const entries = parsePorcelainV1Z(
    gitBuffer(repository, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]),
  );

  assert.deepEqual(entries[0].paths.sort(), [
    "public/games/tiles-game/index.html",
    "unrelated.html",
  ]);
  assert.deepEqual(findUnrelatedPaths(entries), ["unrelated.html"]);
});

function createRepository(files) {
  const repository = mkdtempSync(join(tmpdir(), "tiles-publish-test-"));
  git(repository, ["init", "-q"]);
  git(repository, ["config", "user.email", "test@example.com"]);
  git(repository, ["config", "user.name", "Test"]);
  for (const [filePath, contents] of Object.entries(files)) {
    write(repository, filePath, contents);
  }
  git(repository, ["add", "."]);
  git(repository, ["commit", "-qm", "initial"]);
  return repository;
}

function write(repository, filePath, contents) {
  const absolutePath = join(repository, filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
  assert.equal(readFileSync(absolutePath, "utf8"), contents);
}

function git(repository, args) {
  return execFileSync("git", args, { cwd: repository, encoding: "utf8" });
}

function gitBuffer(repository, args) {
  return execFileSync("git", args, { cwd: repository });
}
