import { expect, test } from "@playwright/test";

const channelId = "123e4567-e89b-42d3-a456-426614174000";
const replacementChannelId = "323e4567-e89b-42d3-a456-426614174000";

test("the enabled Tile child completes the strict account bridge lifecycle", async ({ page }) => {
  await page.route("**/__account-parent__", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0">
        <iframe id="game" style="display:block;width:100vw;height:100vh;border:0" src="/games/tiles-game/#rc-auth-v1=${channelId}"></iframe>
        <script>
          window.childMessages = [];
          window.addEventListener('message', (event) => {
            if (event.origin === location.origin && event.source === document.querySelector('#game').contentWindow) {
              window.childMessages.push(event.data);
            }
          });
        </script>
      </body></html>`,
    });
  });
  await page.goto("/__account-parent__");

  const ready = await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { childMessages?: Array<Record<string, unknown>> }).childMessages
      ?.find((message) => message.type === "BRIDGE_READY") ?? null
  )).not.toBeNull();
  void ready;
  const bridgeReady = await page.evaluate(() =>
    (window as typeof window & { childMessages: Array<Record<string, unknown>> }).childMessages
      .find((message) => message.type === "BRIDGE_READY")!
  );
  expect(bridgeReady).toMatchObject({
    namespace: "roadcrosser.tiles.auth",
    version: 1,
    channelId,
    type: "BRIDGE_READY",
    payload: { supportedVersions: [1], buildId: "tiles-0.1.0" },
  });

  await page.evaluate(({ channelId, iframeInstanceId }) => {
    const frame = document.querySelector<HTMLIFrameElement>("#game")!;
    frame.contentWindow!.postMessage({
      namespace: "roadcrosser.tiles.auth",
      version: 1,
      channelId,
      iframeInstanceId,
      messageId: "223e4567-e89b-42d3-a456-426614174000",
      type: "BRIDGE_INIT",
      payload: {
        authRevision: 1,
        authGeneration: "guest-generation-123456",
        account: { state: "guest" },
      },
    }, location.origin);
  }, { channelId, iframeInstanceId: bridgeReady.iframeInstanceId });

  const gameFrame = page.frameLocator("#game");
  await expect(gameFrame.getByText("Guest play is available.")).toBeVisible();
  await gameFrame.getByRole("button", { name: "Sign in & save", exact: true }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { childMessages: Array<Record<string, unknown>> }).childMessages
      .find((message) => message.type === "SIGN_IN_REQUEST") ?? null
  )).toMatchObject({
    namespace: "roadcrosser.tiles.auth",
    version: 1,
    channelId,
    iframeInstanceId: bridgeReady.iframeInstanceId,
    type: "SIGN_IN_REQUEST",
    payload: { observedAuthGeneration: "guest-generation-123456", reason: "account-indicator" },
  });
});

test("the Tile child re-handshakes when a login return replaces the bridge channel without reloading the document", async ({ page }) => {
  await page.route("**/__account-parent__", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
        <iframe id="game" src="/games/tiles-game/#rc-auth-v1=${channelId}"></iframe>
        <script>
          window.childMessages = [];
          window.addEventListener('message', (event) => {
            if (event.origin === location.origin && event.source === document.querySelector('#game').contentWindow) {
              window.childMessages.push(event.data);
            }
          });
        </script>
      </body></html>`,
    });
  });
  await page.goto("/__account-parent__");
  await expect.poll(() => page.evaluate((expectedChannel) =>
    (window as typeof window & { childMessages?: Array<{ channelId?: string }> }).childMessages
      ?.some((message) => message.channelId === expectedChannel), channelId)).toBe(true);

  const originalDocumentMarker = await page.frameLocator("#game").locator("html").evaluate((html) => {
    const marker = crypto.randomUUID();
    html.dataset.documentMarker = marker;
    return marker;
  });
  await page.locator("#game").evaluate((frame: HTMLIFrameElement, nextChannel) => {
    frame.contentWindow!.location.hash = `rc-auth-v1=${nextChannel}`;
  }, replacementChannelId);

  await expect.poll(() => page.evaluate((nextChannel) =>
    (window as typeof window & { childMessages?: Array<{ channelId?: string; type?: string }> }).childMessages
      ?.some((message) => message.type === "BRIDGE_READY" && message.channelId === nextChannel), replacementChannelId)).toBe(true);
  await expect(page.frameLocator("#game").locator("html"))
    .toHaveAttribute("data-document-marker", originalDocumentMarker);
});
