import {
  applyMove,
  createInitialGameState,
  undoMove,
  type LevelDefinition,
} from "../engine";
import {
  REPLAY_CONTRACT_VERSION,
  type PublicErrorCode,
} from "./protocol";
import { isReplayCommand } from "./replayCommand";

export { REPLAY_CONTRACT_VERSION } from "./protocol";

export type ReplayInput = {
  readonly replayContractVersion: number;
  readonly levelVersionId: string;
  readonly level: LevelDefinition;
  readonly commandLog: readonly unknown[];
};

export type ReplayResult =
  | {
      readonly ok: true;
      readonly removedTileCount: number;
      readonly commandCount: number;
    }
  | {
      readonly ok: false;
      readonly code: Extract<
        PublicErrorCode,
        | "REPLAY_CONTRACT_VERSION_MISMATCH"
        | "LEVEL_VERSION_MISMATCH"
        | "RUN_COMMAND_INVALID"
        | "RUN_COMMAND_UNKNOWN_TILE"
        | "RUN_COMMAND_BLOCKED"
        | "RUN_UNDO_REDUNDANT"
        | "RUN_COMMAND_AFTER_COMPLETE"
        | "RUN_NOT_COMPLETE"
      >;
      readonly commandIndex?: number;
    };

export function canonicalGameplayJson(level: LevelDefinition): string {
  return JSON.stringify({
    width: level.width,
    height: level.height,
    tiles: [...level.tiles]
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
      )
      .map((tile) => ({
        id: tile.id,
        row: tile.cell.row,
        col: tile.cell.col,
        direction: tile.direction,
      })),
  });
}

export async function levelVersionId(
  level: LevelDefinition,
  replayContractVersion: number = REPLAY_CONTRACT_VERSION,
): Promise<string> {
  const input = `${replayContractVersion}\n${canonicalGameplayJson(level)}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `sha256:${hex}`;
}

export async function replayCommandLog(
  input: ReplayInput,
): Promise<ReplayResult> {
  if (input.replayContractVersion !== REPLAY_CONTRACT_VERSION) {
    return { ok: false, code: "REPLAY_CONTRACT_VERSION_MISMATCH" };
  }

  if ((await levelVersionId(input.level)) !== input.levelVersionId) {
    return { ok: false, code: "LEVEL_VERSION_MISMATCH" };
  }

  let state = createInitialGameState(input.level);

  for (const [commandIndex, command] of input.commandLog.entries()) {
    if (state.status === "complete") {
      return { ok: false, code: "RUN_COMMAND_AFTER_COMPLETE", commandIndex };
    }

    if (!isReplayCommand(command)) {
      return { ok: false, code: "RUN_COMMAND_INVALID", commandIndex };
    }

    if (command.type === "undo") {
      const nextState = undoMove(state);
      if (nextState === state) {
        return { ok: false, code: "RUN_UNDO_REDUNDANT", commandIndex };
      }
      state = nextState;
      continue;
    }

    const move = applyMove(command.tileId, state);
    if (move.type === "not_found") {
      return { ok: false, code: "RUN_COMMAND_UNKNOWN_TILE", commandIndex };
    }
    if (move.type === "blocked") {
      return { ok: false, code: "RUN_COMMAND_BLOCKED", commandIndex };
    }
    state = move.state;
  }

  if (state.status !== "complete") {
    return { ok: false, code: "RUN_NOT_COMPLETE" };
  }

  return {
    ok: true,
    removedTileCount: state.moveCount,
    commandCount: input.commandLog.length,
  };
}
