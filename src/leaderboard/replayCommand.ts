export type RemoveReplayCommand = {
  readonly type: "remove";
  readonly tileId: string;
};

export type UndoReplayCommand = {
  readonly type: "undo";
};

export type ReplayCommand = RemoveReplayCommand | UndoReplayCommand;

export function isReplayCommand(value: unknown): value is ReplayCommand {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "remove") {
    return (
      hasExactKeys(value, ["type", "tileId"]) &&
      typeof value.tileId === "string" &&
      value.tileId.length > 0
    );
  }

  return value.type === "undo" && hasExactKeys(value, ["type"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}
