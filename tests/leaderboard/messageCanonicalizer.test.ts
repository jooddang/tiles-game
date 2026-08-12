import { describe, expect, it } from "vitest";
import fixtureJson from "../../contracts/tiles-message-canonicalization-v1.json";
import { canonicalizePublicMessage } from "../../src/leaderboard/messageCanonicalizer";

const fixture = fixtureJson as {
  valid: Array<{ name: string; input?: string; inputParts?: Parts; output: {
    normalized?: string; normalizedParts?: Parts; scalarCount: number; graphemeCount: number; byteCount: number;
  } }>;
  invalid: Array<{ name: string; input?: string; inputParts?: Parts }>;
};

type Parts = { prefix?: string; repeat?: string; count?: number; suffix?: string };

describe("public message canonicalizer frozen v1 fixture", () => {
  for (const vector of fixture.valid) {
    it(`accepts ${vector.name}`, () => {
      const result = canonicalizePublicMessage(materialize(vector.input, vector.inputParts));
      expect(result).toEqual({
        ok: true,
        value: materialize(vector.output.normalized, vector.output.normalizedParts),
        scalars: vector.output.scalarCount,
        graphemes: vector.output.graphemeCount,
        bytes: vector.output.byteCount,
      });
    });
  }
  for (const vector of fixture.invalid) {
    it(`rejects ${vector.name}`, () => {
      expect(canonicalizePublicMessage(materialize(vector.input, vector.inputParts))).toMatchObject({ ok: false });
    });
  }
});

function materialize(value?: string, parts?: Parts) {
  if (value !== undefined) return value;
  return `${parts?.prefix ?? ""}${(parts?.repeat ?? "").repeat(parts?.count ?? 0)}${parts?.suffix ?? ""}`;
}
