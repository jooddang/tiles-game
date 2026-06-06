import { useEffect } from "react";
import type { LevelDefinition } from "../engine";
import { BoardView } from "./BoardView";
import { GameHud } from "./GameHud";
import { useGameController } from "./useGameController";

export type GameScreenProps = {
  readonly levels?: readonly LevelDefinition[];
};

export function GameScreen({ levels }: GameScreenProps) {
  const controller = useGameController(levels);
  const blockedCount = controller.blockedFeedback?.blockerIds.length ?? 0;

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent) {
      const target = event.target;
      const isFormField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;

      if (isFormField) {
        return;
      }

      if (event.key.toLowerCase() === "u" || event.key.toLowerCase() === "z") {
        controller.undo();
      }

      if (event.key.toLowerCase() === "r") {
        controller.restart();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [controller]);

  return (
    <main className="game-screen" data-theme="cosmic-arcade">
      <GameHud controller={controller} />

      <section className="play-area" aria-live="polite">
        <BoardView
          gameState={controller.gameState}
          exitingTiles={controller.exitingTiles}
          blockedFeedback={controller.blockedFeedback}
          onPlayTile={controller.playTile}
        />

        <div className="feedback-panel">
          {controller.gameState.status === "complete" ? (
            <div className="completion" role="status">
              <strong>Level clear</strong>
              <span>
                Solved in {controller.gameState.moveCount} moves. Hit Next to keep
                going.
              </span>
            </div>
          ) : controller.blockedFeedback ? (
            <div className="blocked-message" role="status">
              <strong>Blocked</strong>
              <span>
                {blockedCount} tile{blockedCount === 1 ? "" : "s"} in the arrow
                path must leave first.
              </span>
            </div>
          ) : (
            <div className="hint-message" role="status">
              <strong>Find an open arrow</strong>
              <span>Remove tiles whose arrow path reaches the edge.</span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
