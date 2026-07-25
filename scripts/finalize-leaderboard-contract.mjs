import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  API_PROTOCOL_VERSION,
  GOLDEN_LEVEL_HASHES,
  GOLDEN_REPLAY_FIXTURES,
  PUBLIC_ERROR_CODES,
  REPLAY_CONTRACT_VERSION,
  canonicalGameplayJson,
  levelManifest,
  levelVersionId,
} from "../dist-server-contract/replay-kernel.mjs";

const outputDirectory = resolve("dist-server-contract");
const kernelPath = resolve(outputDirectory, "replay-kernel.mjs");
const protocolDeclarationFiles = ["protocol.d.ts", "replayCommand.d.ts"];
const rulesetSourcePaths = [
  "src/engine/board.ts",
  "src/engine/directions.ts",
  "src/engine/hexLayout.ts",
  "src/engine/moves.ts",
  "src/engine/types.ts",
  "src/leaderboard/replayCommand.ts",
  "src/leaderboard/replayContract.ts",
];

const levels = await Promise.all(
  levelManifest.map(async (level) => ({
    levelKey: level.id,
    levelVersionId: await levelVersionId(level),
    canonicalGameplay: JSON.parse(canonicalGameplayJson(level)),
    level: {
      id: level.id,
      width: level.width,
      height: level.height,
      tiles: level.tiles.map(({ id, cell, direction }) => ({
        id,
        cell,
        direction,
      })),
    },
  })),
);

const kernelSha256 = createHash("sha256")
  .update(await readFile(kernelPath))
  .digest("hex");
const protocolSha256 = createHash("sha256");
for (const declarationFile of protocolDeclarationFiles) {
  protocolSha256.update(declarationFile);
  protocolSha256.update("\0");
  protocolSha256.update(
    await readFile(resolve(outputDirectory, declarationFile)),
  );
  protocolSha256.update("\0");
}
const rulesetSourceSha256 = createHash("sha256");
for (const sourcePath of rulesetSourcePaths) {
  rulesetSourceSha256.update(sourcePath);
  rulesetSourceSha256.update("\0");
  rulesetSourceSha256.update(await readFile(resolve(sourcePath)));
  rulesetSourceSha256.update("\0");
}

await writeJson("levels.json", levels);
await writeJson("golden-replays.json", {
  levelVersionIds: GOLDEN_LEVEL_HASHES,
  fixtures: GOLDEN_REPLAY_FIXTURES,
});
await writeJson("contract.json", {
  apiProtocolVersion: API_PROTOCOL_VERSION,
  replayContractVersion: REPLAY_CONTRACT_VERSION,
  kernelSha256: `sha256:${kernelSha256}`,
  protocolSha256: `sha256:${protocolSha256.digest("hex")}`,
  rulesetSourceSha256: `sha256:${rulesetSourceSha256.digest("hex")}`,
  rulesetSourcePaths,
  protocolDeclarationFiles,
  publicErrorCodes: PUBLIC_ERROR_CODES,
  levels: levels.map(({ levelKey, levelVersionId }) => ({
    levelKey,
    levelVersionId,
  })),
});

async function writeJson(fileName, value) {
  await writeFile(
    resolve(outputDirectory, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}
