export type Direction =
  | "up"
  | "upRight"
  | "downRight"
  | "down"
  | "downLeft"
  | "upLeft";

export type Cell = {
  readonly row: number;
  readonly col: number;
};

export type Tile = {
  readonly id: string;
  readonly cell: Cell;
  readonly direction: Direction;
  readonly color?: string;
};

export type LevelDefinition = {
  readonly id: string;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Tile[];
};

export type GameStatus = "playing" | "complete";

export type GameState = {
  readonly level: LevelDefinition;
  readonly remainingTiles: readonly Tile[];
  readonly moveHistory: readonly (readonly Tile[])[];
  readonly moveCount: number;
  readonly status: GameStatus;
};

export type ValidationIssue =
  | "empty_board"
  | "invalid_dimensions"
  | "duplicate_tile_id"
  | "duplicate_tile_cell"
  | "invalid_direction"
  | "tile_out_of_bounds"
  | "unsolvable_cycle";

export type ValidationError = {
  readonly code: ValidationIssue;
  readonly message: string;
  readonly tileId?: string;
};

export type ValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly issues: readonly ValidationError[];
    };

export type MoveResult =
  | {
      readonly type: "removed";
      readonly tileId: string;
      readonly state: GameState;
    }
  | {
      readonly type: "blocked";
      readonly tileId: string;
      readonly blockers: readonly Tile[];
      readonly state: GameState;
    }
  | {
      readonly type: "not_found";
      readonly tileId: string;
      readonly state: GameState;
      readonly error: "tile_not_found";
    };

export type DependencyEdge = {
  readonly blockerId: string;
  readonly blockedId: string;
};
