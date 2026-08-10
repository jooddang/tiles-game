export const AUTH_BRIDGE_NAMESPACE = "roadcrosser.tiles.auth" as const;
export const AUTH_BRIDGE_VERSION = 1 as const;

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type AccountSnapshot = {
  readonly authRevision: number;
  readonly authGeneration: string;
  readonly account:
    | { readonly state: "guest" }
    | { readonly state: "authenticated"; readonly publicName: string }
    | { readonly state: "unavailable" };
};

export type ParentMessage = {
  readonly namespace: typeof AUTH_BRIDGE_NAMESPACE;
  readonly version: typeof AUTH_BRIDGE_VERSION;
  readonly channelId: string;
  readonly iframeInstanceId: string;
  readonly messageId: string;
  readonly type: "BRIDGE_INIT" | "ACCOUNT_STATUS" | "REQUEST_REJECTED";
  readonly payload: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function parseAccount(value: unknown): AccountSnapshot["account"] | null {
  if (!isRecord(value) || typeof value.state !== "string") return null;
  if (value.state === "authenticated") {
    return exactKeys(value, ["state", "publicName"])
      && typeof value.publicName === "string" && value.publicName.length >= 3 && value.publicName.length <= 96
      ? { state: "authenticated", publicName: value.publicName } : null;
  }
  return (value.state === "guest" || value.state === "unavailable") && exactKeys(value, ["state"])
    ? { state: value.state } : null;
}

export function parseAccountSnapshot(value: Record<string, unknown>, allowResponseTo: boolean): AccountSnapshot | null {
  const required = ["authRevision", "authGeneration", "account"];
  const validKeys = exactKeys(value, required)
    || (allowResponseTo && exactKeys(value, [...required, "responseTo"]));
  const account = parseAccount(value.account);
  if (!validKeys || !Number.isSafeInteger(value.authRevision) || (value.authRevision as number) < 1
    || typeof value.authGeneration !== "string" || !/^[A-Za-z0-9_-]{22,64}$/.test(value.authGeneration)
    || !account || ("responseTo" in value && (typeof value.responseTo !== "string" || !idPattern.test(value.responseTo)))) {
    return null;
  }
  return { authRevision: value.authRevision as number, authGeneration: value.authGeneration, account };
}

export function parseParentMessage(value: unknown): ParentMessage | null {
  if (!isRecord(value) || !exactKeys(value, ["namespace", "version", "channelId", "iframeInstanceId", "messageId", "type", "payload"])
    || value.namespace !== AUTH_BRIDGE_NAMESPACE || value.version !== AUTH_BRIDGE_VERSION
    || typeof value.channelId !== "string" || !idPattern.test(value.channelId)
    || typeof value.iframeInstanceId !== "string" || !idPattern.test(value.iframeInstanceId)
    || typeof value.messageId !== "string" || !idPattern.test(value.messageId)
    || !isRecord(value.payload)) return null;
  if (value.type === "BRIDGE_INIT" && !parseAccountSnapshot(value.payload, false)) return null;
  if (value.type === "ACCOUNT_STATUS" && !parseAccountSnapshot(value.payload, true)) return null;
  if (value.type === "REQUEST_REJECTED") {
    if (!exactKeys(value.payload, ["responseTo", "code"])
      || typeof value.payload.responseTo !== "string" || !idPattern.test(value.payload.responseTo)
      || !["STALE_AUTH_STATE", "ALREADY_AUTHENTICATED", "BRIDGE_UNAVAILABLE"].includes(String(value.payload.code))) return null;
  } else if (value.type !== "BRIDGE_INIT" && value.type !== "ACCOUNT_STATUS") return null;
  return value as ParentMessage;
}

export function childMessage(
  channelId: string,
  iframeInstanceId: string,
  type: "BRIDGE_READY" | "ACCOUNT_STATUS_REQUEST" | "SIGN_IN_REQUEST",
  payload: Record<string, unknown>,
) {
  return {
    namespace: AUTH_BRIDGE_NAMESPACE,
    version: AUTH_BRIDGE_VERSION,
    channelId,
    iframeInstanceId,
    messageId: crypto.randomUUID(),
    type,
    payload,
  } as const;
}

export function authBridgeChannel(hash: string): string | null {
  const match = /^#rc-auth-v1=([0-9a-f-]{36})$/.exec(hash);
  return match && idPattern.test(match[1]) ? match[1] : null;
}
