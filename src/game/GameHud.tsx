import type { GameController } from "./useGameController";

export type GameHudProps = {
  readonly controller: GameController;
};

export function GameHud({ controller }: GameHudProps) {
  const completedCount = controller.progress.completedLevelIds.length;

  return (
    <aside className="hud" aria-label="Game controls">
      <div className="level-meta">
        <p className="eyebrow">Level {controller.currentLevelIndex + 1}</p>
        <h1>{controller.currentLevel.title}</h1>
        <p>
          {completedCount} of {controller.levels.length} levels cleared
        </p>
      </div>

      <dl className="stats">
        <div>
          <dt>Moves</dt>
          <dd data-testid="move-count">{controller.gameState.moveCount}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{controller.elapsedSeconds}s</dd>
        </div>
      </dl>

      <div className="control-row">
        <button
          type="button"
          className="game-button"
          onClick={controller.undo}
          disabled={!controller.canUndo}
        >
          Undo
        </button>
        <button type="button" className="game-button" onClick={controller.restart}>
          Retry
        </button>
      </div>

      <div className="control-row">
        <button
          type="button"
          className="game-button"
          onClick={controller.goPreviousLevel}
          disabled={!controller.canGoPrevious}
        >
          Prev
        </button>
        <button
          type="button"
          className="game-button"
          onClick={controller.goNextLevel}
          disabled={!controller.canGoNext}
        >
          Next
        </button>
      </div>

      <label className="level-picker">
        <span>Pick level</span>
        <select
          value={controller.currentLevelIndex}
          onChange={(event) => controller.goToLevel(Number(event.target.value))}
        >
          {controller.levels.map((level, index) => (
            <option key={level.id} value={index}>
              {index + 1}. {level.title}
            </option>
          ))}
        </select>
      </label>

      {!controller.storageAvailable ? (
        <p className="notice" role="status">
          Progress is saved only for this session.
        </p>
      ) : null}
    </aside>
  );
}
