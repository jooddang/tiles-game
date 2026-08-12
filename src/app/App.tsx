import { GameScreen } from "../game/GameScreen";
import { AccountIndicator } from "../account/AccountIndicator";
import { useRoadcrosserAccount } from "../account/useRoadcrosserAccount";

export function App() {
  const account = useRoadcrosserAccount();
  return (
    <>
      {account.enabled ? <AccountIndicator snapshot={account.snapshot} onSignIn={account.requestSignIn} /> : null}
      <GameScreen
        accountSnapshot={account.enabled ? account.snapshot : undefined}
        onSignIn={account.requestSignIn}
      />
    </>
  );
}
