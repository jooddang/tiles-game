import type { Direction, LevelDefinition, Tile } from "../engine";

const WIDTH = 9;
const FULL_HEIGHT = 30;
const INTRO_STAGE_HEIGHTS = [8, 11, 14, 17, 20, 23, 26, 28] as const;

const DIRECTION_BY_CODE: Record<string, Direction> = {
  U: "up",
  A: "upRight",
  B: "downRight",
  D: "down",
  C: "downLeft",
  L: "upLeft",
};

const HORIZONTAL_MIRROR: Record<Direction, Direction> = {
  up: "up",
  upRight: "upLeft",
  downRight: "downLeft",
  down: "down",
  downLeft: "downRight",
  upLeft: "upRight",
};

const RANDOM_HARD_ROWS: readonly string[] = [
  "AAULAUCBU",
  "AUABUADDD",
  "ACLCDBABC",
  "LULUDLDAB",
  "CUUDBCCDD",
  "ULCBCABCA",
  "UUBDBDBCD",
  "UCDLCDDDD",
  "UCLLLLAAA",
  "CLCCDDLCC",
  "UUDCLBLDD",
  "UUCLLLDDC",
  "LULLACDLA",
  "UCDLLLDDC",
  "ULCDDDDAB",
  "UUDLLBAAL",
  "CUCADCDCL",
  "UUCLDCLBA",
  "UUBCDBADD",
  "CLCCAADBC",
  "LUDADBBAD",
  "CUADCCACC",
  "UULLCDBDD",
  "LULLCBDDB",
  "UCLLDBDCC",
  "UDCLCCCBD",
  "UDLCLDLDD",
  "BBLCLLLLD",
  "ULBBDLABD",
  "ULAADDBCC",
];

export const referenceLevels: readonly LevelDefinition[] = [
  ...INTRO_STAGE_HEIGHTS.map((height, index) =>
    createReferenceLevel({
      id: `reference-hex-tower-stage-${index + 1}`,
      title: `Hex Tower ${index + 1}`,
      tileIdPrefix: `ref-stage-${index + 1}`,
      rows: RANDOM_HARD_ROWS,
      height,
    }),
  ),
  createReferenceLevel({
    id: "reference-hex-tower-1",
    title: "Hex Tower",
    tileIdPrefix: "ref",
    rows: RANDOM_HARD_ROWS,
    height: FULL_HEIGHT,
  }),
  createReferenceLevel({
    id: "reference-hex-tower-2",
    title: "Hex Tower II",
    tileIdPrefix: "ref-2",
    rows: mirrorRowsHorizontally(RANDOM_HARD_ROWS),
    height: FULL_HEIGHT,
  }),
];

function createReferenceLevel({
  id,
  title,
  tileIdPrefix,
  rows,
  height,
}: {
  readonly id: string;
  readonly title: string;
  readonly tileIdPrefix: string;
  readonly rows: readonly string[];
  readonly height: number;
}): LevelDefinition {
  const tiles: Tile[] = [];

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < WIDTH; col += 1) {
      const direction = directionFromCode(rows[row][col]);
      tiles.push({
        id: `${tileIdPrefix}-${tiles.length + 1}`,
        cell: { row, col },
        direction,
        color: direction,
      });
    }
  }

  return {
    id,
    title,
    width: WIDTH,
    height,
    tiles,
  };
}

function mirrorRowsHorizontally(rows: readonly string[]): readonly string[] {
  return rows.map((row) =>
    [...row]
      .reverse()
      .map((code) => directionCode(HORIZONTAL_MIRROR[directionFromCode(code)]))
      .join(""),
  );
}

function directionFromCode(code: string): Direction {
  const direction = DIRECTION_BY_CODE[code];

  if (!direction) {
    throw new Error(`Unknown Hex Tower direction code '${code}'.`);
  }

  return direction;
}

function directionCode(direction: Direction): string {
  const entry = Object.entries(DIRECTION_BY_CODE).find(
    ([, candidate]) => candidate === direction,
  );

  if (!entry) {
    throw new Error(`Unknown Hex Tower direction '${direction}'.`);
  }

  return entry[0];
}
