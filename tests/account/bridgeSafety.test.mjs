import fs from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseParentMessage } from "../../src/account/protocol";

describe("Tile child bridge safety", () => {
  const source = fs.readFileSync(new URL("../../src/account/useRoadcrosserAccount.ts", import.meta.url), "utf8");
  const fixture = JSON.parse(fs.readFileSync(new URL("../../contracts/tiles-auth-bridge-v1.json", import.meta.url), "utf8"));

  it("matches the reviewed Road producer fixture digest", () => {
    const bytes = fs.readFileSync(new URL("../../contracts/tiles-auth-bridge-v1.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("ea2dc9587e80ec3b17e2bc4cb2fc9f1fced260f083f65de4dce3d3517c420a33");
  });

  it("accepts every parent message in the cross-repository fixture", () => {
    expect(fixture.parentMessages.map(parseParentMessage).every(Boolean)).toBe(true);
  });

  it("binds every received message to the exact parent origin and window", () => {
    expect(source).toMatch(/event\.origin !== window\.location\.origin/);
    expect(source).toMatch(/event\.source !== window\.parent/);
  });

  it("uses an exact target origin and never sends a caller-selected URL", () => {
    expect(source).toMatch(/postMessage\([\s\S]*window\.location\.origin\)/);
    expect(source).not.toMatch(/postMessage\([^\n]+, ["']\*["']\)/);
    expect(source).not.toMatch(/returnTo|signInPath|navigate|location\.assign/i);
  });
});
