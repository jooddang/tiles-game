import type { LevelDefinition } from "../engine";
import { REPLAY_CONTRACT_VERSION } from "./protocol";
import type { ReplayInput, ReplayResult } from "./replayContract";

const goldenLevel: LevelDefinition = {
  id: "golden-contract-level",
  title: "Golden contract level",
  width: 2,
  height: 1,
  tiles: [
    {
      id: "second",
      cell: { row: 0, col: 1 },
      direction: "downRight",
      color: "red",
    },
    {
      id: "first",
      cell: { row: 0, col: 0 },
      direction: "downLeft",
      color: "blue",
    },
  ],
};

const blockedLevel: LevelDefinition = {
  id: "blocked-contract-level",
  title: "Blocked contract level",
  width: 1,
  height: 2,
  tiles: [
    { id: "blocked", cell: { row: 1, col: 0 }, direction: "up" },
    { id: "blocker", cell: { row: 0, col: 0 }, direction: "up" },
  ],
};

const GOLDEN_LEVEL_VERSION_ID =
  "sha256:4ab54479899521a8b4d04b2d8a77caef9beabc8c87bb5c5e33a43e64c5bdb529";
const BLOCKED_LEVEL_VERSION_ID =
  "sha256:3a1c4ebe694b09b146bb7ebb45b2bf0ea5563de6da6a760bf2f20a354141eac0";

export type GoldenReplayFixture = {
  readonly name: string;
  readonly input: ReplayInput;
  readonly expected: ReplayResult;
};

export const GOLDEN_REPLAY_FIXTURES: readonly GoldenReplayFixture[] = [
  {
    name: "legal completion with state-changing undo",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: GOLDEN_LEVEL_VERSION_ID,
      level: goldenLevel,
      commandLog: [
        { type: "remove", tileId: "first" },
        { type: "undo" },
        { type: "remove", tileId: "first" },
        { type: "remove", tileId: "second" },
      ],
    },
    expected: {
      ok: true,
      removedTileCount: 2,
      commandCount: 4,
    },
  },
  {
    name: "blocked removal",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: BLOCKED_LEVEL_VERSION_ID,
      level: blockedLevel,
      commandLog: [{ type: "remove", tileId: "blocked" }],
    },
    expected: { ok: false, code: "RUN_COMMAND_BLOCKED", commandIndex: 0 },
  },
  {
    name: "unknown tile",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: GOLDEN_LEVEL_VERSION_ID,
      level: goldenLevel,
      commandLog: [{ type: "remove", tileId: "missing" }],
    },
    expected: {
      ok: false,
      code: "RUN_COMMAND_UNKNOWN_TILE",
      commandIndex: 0,
    },
  },
  {
    name: "malformed command",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: GOLDEN_LEVEL_VERSION_ID,
      level: goldenLevel,
      commandLog: [{ type: "remove", tileId: "first", extra: true }],
    },
    expected: { ok: false, code: "RUN_COMMAND_INVALID", commandIndex: 0 },
  },
  {
    name: "redundant undo",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: GOLDEN_LEVEL_VERSION_ID,
      level: goldenLevel,
      commandLog: [{ type: "undo" }],
    },
    expected: { ok: false, code: "RUN_UNDO_REDUNDANT", commandIndex: 0 },
  },
  {
    name: "incomplete run",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: GOLDEN_LEVEL_VERSION_ID,
      level: goldenLevel,
      commandLog: [{ type: "remove", tileId: "first" }],
    },
    expected: { ok: false, code: "RUN_NOT_COMPLETE" },
  },
  {
    name: "level version mismatch",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: `sha256:${"0".repeat(64)}`,
      level: goldenLevel,
      commandLog: [],
    },
    expected: { ok: false, code: "LEVEL_VERSION_MISMATCH" },
  },
  {
    name: "replay contract version mismatch",
    input: {
      replayContractVersion: 999,
      levelVersionId: GOLDEN_LEVEL_VERSION_ID,
      level: goldenLevel,
      commandLog: [],
    },
    expected: { ok: false, code: "REPLAY_CONTRACT_VERSION_MISMATCH" },
  },
  {
    name: "command after completion",
    input: {
      replayContractVersion: REPLAY_CONTRACT_VERSION,
      levelVersionId: GOLDEN_LEVEL_VERSION_ID,
      level: goldenLevel,
      commandLog: [
        { type: "remove", tileId: "first" },
        { type: "remove", tileId: "second" },
        { type: "undo" },
      ],
    },
    expected: {
      ok: false,
      code: "RUN_COMMAND_AFTER_COMPLETE",
      commandIndex: 2,
    },
  },
];

export const GOLDEN_LEVEL_HASHES = {
  golden: GOLDEN_LEVEL_VERSION_ID,
  blocked: BLOCKED_LEVEL_VERSION_ID,
} as const;
