import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTH_BRIDGE_VERSION,
  authBridgeChannel,
  childMessage,
  parseAccountSnapshot,
  parseParentMessage,
  type AccountSnapshot,
} from "./protocol";

type AccountBridgeState = {
  readonly enabled: boolean;
  readonly snapshot: AccountSnapshot | null;
  readonly requestSignIn: () => void;
};

const buildEnabled = (
  import.meta as ImportMeta & { readonly env?: Readonly<Record<string, string | undefined>> }
).env?.VITE_ROADCROSSER_AUTH_BRIDGE_ENABLED === "true";

export function useRoadcrosserAccount(): AccountBridgeState {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [channelId, setChannelId] = useState(() => authBridgeChannel(window.location.hash));
  const instanceIdRef = useRef(crypto.randomUUID());
  const lastRevisionRef = useRef(0);
  const enabled = buildEnabled && window.parent !== window && channelId !== null;

  const send = useCallback((type: "BRIDGE_READY" | "ACCOUNT_STATUS_REQUEST" | "SIGN_IN_REQUEST", payload: Record<string, unknown>) => {
    if (!enabled || !channelId) return;
    window.parent.postMessage(childMessage(channelId, instanceIdRef.current, type, payload), window.location.origin);
  }, [channelId, enabled]);

  useEffect(() => {
    const observeChannel = () => setChannelId(authBridgeChannel(window.location.hash));
    window.addEventListener("hashchange", observeChannel);
    return () => window.removeEventListener("hashchange", observeChannel);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setSnapshot(null);
    lastRevisionRef.current = 0;
    let readyAcknowledged = false;
    let readyTimer: ReturnType<typeof setInterval> | null = null;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = parseParentMessage(event.data);
      if (!message || message.channelId !== channelId
        || message.iframeInstanceId !== instanceIdRef.current) return;
      if (message.type === "BRIDGE_INIT" || message.type === "ACCOUNT_STATUS") {
        const next = parseAccountSnapshot(message.payload, message.type === "ACCOUNT_STATUS");
        if (!next || next.authRevision <= lastRevisionRef.current) return;
        readyAcknowledged = true;
        if (readyTimer) clearInterval(readyTimer);
        lastRevisionRef.current = next.authRevision;
        setSnapshot(next);
      }
    };
    window.addEventListener("message", onMessage);
    const sendReady = () => {
      if (!readyAcknowledged) {
        send("BRIDGE_READY", { supportedVersions: [AUTH_BRIDGE_VERSION], buildId: "tiles-0.1.0" });
      }
    };
    sendReady();
    readyTimer = setInterval(sendReady, 250);
    return () => {
      if (readyTimer) clearInterval(readyTimer);
      window.removeEventListener("message", onMessage);
    };
  }, [channelId, enabled, send]);

  const requestSignIn = useCallback(() => {
    if (!snapshot || snapshot.account.state !== "guest") return;
    send("SIGN_IN_REQUEST", {
      observedAuthGeneration: snapshot.authGeneration,
      reason: "account-indicator",
    });
  }, [send, snapshot]);

  return { enabled, snapshot, requestSignIn };
}
