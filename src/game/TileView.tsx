import type { CSSProperties } from "react";
import type { Tile } from "../engine";

const ARROWS: Record<Tile["direction"], string> = {
  up: "↑",
  upRight: "↗",
  downRight: "↘",
  down: "↓",
  downLeft: "↙",
  upLeft: "↖",
};

type TileStyle = CSSProperties & {
  readonly "--exit-x": string;
  readonly "--exit-y": string;
};

export type TileViewProps = {
  readonly tile: Tile;
  readonly isBlockedSource: boolean;
  readonly isBlocker: boolean;
  readonly isExiting?: boolean;
  readonly leftUnits: number;
  readonly topUnits: number;
  readonly exitXUnits?: number;
  readonly exitYUnits?: number;
  readonly onPlay: (tileId: string) => void;
};

export function TileView({
  tile,
  isBlockedSource,
  isBlocker,
  isExiting = false,
  leftUnits,
  topUnits,
  exitXUnits = 0,
  exitYUnits = 0,
  onPlay,
}: TileViewProps) {
  const tileStyle: TileStyle = {
    left: `calc(${leftUnits} * var(--hex-unit))`,
    top: `calc(${topUnits} * var(--hex-unit))`,
    "--exit-x": `calc(${exitXUnits} * var(--hex-unit))`,
    "--exit-y": `calc(${exitYUnits} * var(--hex-unit))`,
  };

  return (
    <button
      className="tile"
      data-direction={tile.direction}
      data-color={tile.color ?? tile.direction}
      data-blocked-source={isBlockedSource ? "true" : undefined}
      data-blocker={isBlocker ? "true" : undefined}
      data-exiting={isExiting ? "true" : undefined}
      style={tileStyle}
      type="button"
      disabled={isExiting}
      aria-label={`Tile ${tile.id} arrow ${tile.direction}`}
      onClick={() => onPlay(tile.id)}
    >
      <span aria-hidden="true">{ARROWS[tile.direction]}</span>
    </button>
  );
}
