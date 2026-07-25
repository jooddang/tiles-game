export const PUBLISH_PATHS = [
  "public/games/tiles-game",
  "vendor/tiles-game-leaderboard",
];

export function parsePorcelainV1Z(output) {
  const records = Buffer.isBuffer(output)
    ? output.toString("utf8").split("\0")
    : output.split("\0");
  const entries = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) {
      continue;
    }

    const status = record.slice(0, 2);
    const paths = [record.slice(3)];
    if (status.includes("R") || status.includes("C")) {
      index += 1;
      if (!records[index]) {
        throw new Error("Malformed git porcelain rename/copy entry.");
      }
      paths.push(records[index]);
    }
    entries.push({ status, paths });
  }

  return entries;
}

export function findUnrelatedPaths(entries) {
  return [
    ...new Set(
      entries
        .flatMap((entry) => entry.paths)
        .filter((filePath) => !isPublishPath(filePath)),
    ),
  ];
}

export function isPublishPath(filePath) {
  return PUBLISH_PATHS.some(
    (root) => filePath === root || filePath.startsWith(`${root}/`),
  );
}
