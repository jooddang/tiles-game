import type { AccountSnapshot } from "../account/protocol";

export function StageStartPanel({
  snapshot,
  rankedAvailable,
  onSignIn,
  onContinue,
  onPractice,
  startFailed = false,
}: {
  readonly snapshot: AccountSnapshot | null;
  readonly rankedAvailable: boolean;
  readonly onSignIn: () => void;
  readonly onContinue: () => void;
  readonly onPractice: () => void;
  readonly startFailed?: boolean;
}) {
  const account = snapshot?.account;
  return (
    <div className="stage-start-backdrop">
      <section className="stage-start-panel" role="dialog" aria-modal="true" aria-label="Start stage">
        <p className="eyebrow">Before you start</p>
        <h2>{startFailed ? "Ranked play is unavailable" : rankedAvailable ? "How do you want to play?" : "Practice is ready"}</h2>
        {startFailed ? (
          <p>Your stage has not started. You can play practice without losing local progress.</p>
        ) : !snapshot ? (
          <p>Connecting to your Roadcrosser Account…</p>
        ) : account?.state === "authenticated" ? (
          <p>Records can be saved as <strong>{account.publicName}</strong>.</p>
        ) : account?.state === "guest" && rankedAvailable ? (
          <p>Sign in to keep records across devices, or continue as a guest.</p>
        ) : (
          <p>Account records are unavailable right now. You can still play practice.</p>
        )}
        <div className="stage-start-actions">
          {!startFailed && account?.state === "guest" && rankedAvailable ? (
            <button type="button" className="game-button completion-primary" onClick={onSignIn}>
              Sign in &amp; save
            </button>
          ) : null}
          {!startFailed ? <button
            type="button"
            className="game-button completion-secondary"
            onClick={onContinue}
            disabled={!snapshot}
          >
            {account?.state === "authenticated"
              ? "Start stage"
              : rankedAvailable && account?.state === "guest"
                ? "Continue as guest"
                : "Play practice"}
          </button> : (
            <button type="button" className="game-button completion-primary" onClick={onPractice}>
              Play practice
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
