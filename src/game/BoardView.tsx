import type { GameState } from "../engine";
import {
  DIRECTION_RAYS,
  getHexBoardSize,
  getHexPosition,
} from "../engine/hexLayout";
import type { BlockedFeedback, ExitingTile } from "./useGameController";
import { TileView } from "./TileView";

export type BoardViewProps = {
  readonly gameState: GameState;
  readonly exitingTiles: readonly ExitingTile[];
  readonly blockedFeedback?: BlockedFeedback;
  readonly onPlayTile: (tileId: string) => void;
};

export function BoardView({
  gameState,
  exitingTiles,
  blockedFeedback,
  onPlayTile,
}: BoardViewProps) {
  const blockerIds = new Set(blockedFeedback?.blockerIds ?? []);
  const boardSize = getHexBoardSize(gameState.level.width, gameState.level.height);

  return (
    <div className="board-scroll">
      <section
        className="board"
        aria-label={`${gameState.level.title} board`}
        style={{
          width: `calc(${boardSize.x} * var(--hex-unit))`,
          height: `calc(${boardSize.y} * var(--hex-unit))`,
        }}
      >
        {gameState.remainingTiles.map((tile) => {
          const position = getHexPosition(tile.cell);

          return (
            <TileView
              key={tile.id}
              tile={tile}
              isBlockedSource={blockedFeedback?.tileId === tile.id}
              isBlocker={blockerIds.has(tile.id)}
              leftUnits={position.x}
              topUnits={position.y}
              onPlay={onPlayTile}
            />
          );
        })}
        {exitingTiles.map(({ tile }) => {
          const position = getHexPosition(tile.cell);
          const exitRay = DIRECTION_RAYS[tile.direction];

          return (
            <TileView
              key={`exiting-${tile.id}`}
              tile={tile}
              isBlockedSource={false}
              isBlocker={false}
              isExiting={true}
              leftUnits={position.x}
              topUnits={position.y}
              exitXUnits={exitRay.x * 12}
              exitYUnits={exitRay.y * 12}
              onPlay={onPlayTile}
            />
          );
        })}
      </section>
    </div>
  );
}
