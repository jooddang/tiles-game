import type { AccountSnapshot } from "../account/protocol";
import type { AccountAttemptCompleteResponse } from "../leaderboard/accountScoreProtocol";
import type { LeaderboardClient } from "../leaderboard/leaderboardClient";
import type { RankedOutboxDatabase } from "../leaderboard/rankedOutbox";
import { useScoreLifecycle } from "../leaderboard/useScoreLifecycle";

export function ScoreLifecyclePanel({
  result, account, client, onSignIn, onRetryBinding, signInAvailable, database,
}: {
  readonly result: AccountAttemptCompleteResponse;
  readonly account: AccountSnapshot | null | undefined;
  readonly client: LeaderboardClient;
  readonly onSignIn: () => void;
  readonly onRetryBinding: () => void;
  readonly signInAvailable: boolean;
  readonly database?: RankedOutboxDatabase;
}) {
  const lifecycle = useScoreLifecycle({ result, account, client, onSignIn, database });
  const { state } = lifecycle;
  if (state.claim === "idle") return null;

  return (
    <section className="score-lifecycle" aria-label="Save and publish score">
      {state.claim === "guest_accepted" || state.claim === "error" ? (
        <>
          <p><strong>Score accepted as guest.</strong> Link this exact score to keep it across devices.</p>
          {signInAvailable ? <PrivateDraftComposer state={state} onChange={lifecycle.setDraft} /> : null}
          {signInAvailable ? <button type="button" className="game-button" onClick={() => void lifecycle.retryClaim()}>
            {state.claim === "error" ? "Retry account link" : "Save to account"}
          </button> : <p>This standalone build has no account connection.</p>}
        </>
      ) : state.claim === "securing" ? (
        <p>Securing this score before sign-in…</p>
      ) : state.claim === "awaiting_auth" ? (
        <>
          <p><strong>Your guest score is safe.</strong> Account linking is waiting for sign-in.</p>
          <PrivateDraftComposer state={state} onChange={lifecycle.setDraft} />
          <button type="button" className="game-button" onClick={lifecycle.retrySignIn}>Retry sign-in</button>
        </>
      ) : state.claim === "confirm_claim" ? (
        <>
          <p>Link this exact score to <strong>{state.publicHandle}</strong>?</p>
          <PrivateDraftComposer state={state} onChange={lifecycle.setDraft} />
          <button type="button" className="game-button" onClick={() => void lifecycle.confirmClaim()}>
            Save to {state.publicHandle}
          </button>
        </>
      ) : state.claim === "claiming" ? (
        <p>Your score is safe; account linking is pending…</p>
      ) : state.claim === "binding_pending" ? (
        <>
          <p>Your score is safe; account binding is still pending.</p>
          <button type="button" className="game-button" onClick={onRetryBinding}>Check account save</button>
        </>
      ) : state.claim === "parked" ? (
        <p role="alert">This score belongs to {state.publicHandle ?? "another account"}. It was not changed.</p>
      ) : state.claim === "claimed" ? (
        <>
          <p><strong>Saved to {state.publicHandle ?? "your account"}.</strong></p>
          {state.canPublish ? <><label className="score-message-composer">
            <span>Public message (optional)</span>
            <textarea
              value={state.draft}
              disabled={state.publication === "publishing" || state.publication === "outcome_unknown"}
              onChange={(event) => lifecycle.setDraft(event.target.value)}
            />
          </label>
          <p className="canonical-preview">
            Preview: {state.canonicalPreview || <em>No public message</em>}
          </p>
          {state.validationError ? <p role="alert">{state.validationError}</p> : null}
          <button
            type="button"
            className="game-button"
            disabled={Boolean(state.validationError) || state.publication === "publishing"}
            onClick={() => void lifecycle.publish()}
          >
            {state.publication === "outcome_unknown"
              ? "Check publication"
              : state.canonicalPreview ? "Publish message" : "Remove message"}
          </button>
          {state.publication === "published" ? (
            <p><strong>Message published.</strong></p>
          ) : null}
          {state.publicationNotice ? <p>{state.publicationNotice}</p> : null}
          </> : <>
            <p>Sign in as {state.publicHandle ?? "the score owner"} to manage its public message.</p>
            {state.draftWarning ? (
              <button type="button" className="game-button" onClick={() => void lifecycle.retryClaim()}>
                Retry securing draft
              </button>
            ) : null}
          </>}
        </>
      ) : null}
      {state.error ? <p role="alert">{state.error} The accepted score was not changed.</p> : null}
      {state.draftWarning ? <p role="alert">{state.draftWarning}</p> : null}
      {state.publication === "parked" ? (
        <div role="alert">
          <p>{state.canRecoverDraft
            ? "Draft parked after this account session changed. Review it before publishing."
            : `A private draft remains locked to ${state.publicHandle ?? "the score owner"}.`}</p>
          {state.canRecoverDraft ? <><button type="button" className="game-button" onClick={() => void lifecycle.recoverDraft()}>
            Use draft with current account
          </button>
          <button type="button" className="text-button" onClick={() => void lifecycle.discardDraft()}>
            Discard draft
          </button>
          </> : null}
        </div>
      ) : null}
    </section>
  );
}

function PrivateDraftComposer({
  state, onChange,
}: {
  readonly state: ReturnType<typeof useScoreLifecycle>["state"];
  readonly onChange: (value: string) => void;
}) {
  return <>
    <label className="score-message-composer">
      <span>Optional public message (kept private until you publish)</span>
      <textarea value={state.draft} onChange={(event) => onChange(event.target.value)} />
    </label>
    <p className="canonical-preview">Preview: {state.canonicalPreview || <em>No public message</em>}</p>
    {state.validationError ? <p role="alert">{state.validationError}</p> : null}
  </>;
}
