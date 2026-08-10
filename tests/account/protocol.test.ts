import { describe, expect, it } from "vitest";
import {
  AUTH_BRIDGE_NAMESPACE,
  authBridgeChannel,
  parseParentMessage,
} from "../../src/account/protocol";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const snapshot = {
  authRevision: 2,
  authGeneration: "123e4567-e89b-42d3-a456-426614174000",
  account: { state: "guest" },
};
const message = {
  namespace: AUTH_BRIDGE_NAMESPACE,
  version: 1,
  channelId: uuid,
  iframeInstanceId: uuid,
  messageId: uuid,
  type: "BRIDGE_INIT",
  payload: snapshot,
};

describe("Roadcrosser auth bridge protocol", () => {
  it("accepts the exact parent snapshot", () => {
    expect(parseParentMessage(message)?.type).toBe("BRIDGE_INIT");
  });

  it.each([
    { ...message, version: 2 },
    { ...message, payload: { ...snapshot, email: "private@example.com" } },
    { ...message, payload: { ...snapshot, authRevision: 0 } },
    { ...message, type: "NAVIGATE", payload: { url: "https://evil.example" } },
    { ...message, extra: "field" },
  ])("rejects stale, secret-bearing, or overprivileged input", (candidate) => {
    expect(parseParentMessage(candidate)).toBeNull();
  });

  it("accepts only the exact versioned channel fragment", () => {
    expect(authBridgeChannel(`#rc-auth-v1=${uuid}`)).toBe(uuid);
    expect(authBridgeChannel(`#other=${uuid}`)).toBeNull();
    expect(authBridgeChannel(`#rc-auth-v1=${uuid}&next=evil`)).toBeNull();
  });
});
