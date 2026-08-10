import type { AccountSnapshot } from "./protocol";

export function AccountIndicator({
  snapshot,
  onSignIn,
}: {
  readonly snapshot: AccountSnapshot | null;
  readonly onSignIn: () => void;
}) {
  if (!snapshot) {
    return <div className="account-indicator" role="status">Connecting account…</div>;
  }
  if (snapshot.account.state === "unavailable") {
    return <div className="account-indicator" role="status">Records account unavailable</div>;
  }
  if (snapshot.account.state === "authenticated") {
    return <div className="account-indicator" role="status">Saving as {snapshot.account.publicName}</div>;
  }
  return (
    <div className="account-indicator" role="status">
      <span>Guest play is available. Sign in to keep records across devices.</span>
      <button type="button" onClick={onSignIn}>Sign in</button>
    </div>
  );
}
