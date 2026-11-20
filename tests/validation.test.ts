import { describe, expect, it } from "vitest";
import { normalizeAction, normalizeCount, normalizeMetadata, normalizePoll } from "../src/validation";

describe("Gateway validation", () => {
  it("rejects non-finite action counts", () => {
    expect(() => normalizeCount(Number.NaN)).toThrow("finite number");
    expect(() => normalizeCount(Number.POSITIVE_INFINITY)).toThrow("finite number");
  });

  it("checks byte lengths, action IDs, enum values and stock before sending", () => {
    const action = { id: "a", impact: 5, name: "", description: "" };
    expect(() => normalizeAction({ ...action, id: "a".repeat(65) })).toThrow();
    expect(() => normalizeAction({ ...action, impact: 6 })).toThrow();
    expect(() => normalizeAction({ ...action, state: 4 as never })).toThrow();
    expect(() => normalizeCount(1.5)).toThrow();
    expect(() => normalizeMetadata({ name: "é".repeat(129) })).toThrow();
    expect(() => normalizeMetadata({ name: "ok", logo: "x".repeat(1024 * 1024 + 1) })).toThrow();
    expect(() => normalizePoll({ prompt: "?", options: Array(11).fill("yes") })).toThrow();
    expect(() => normalizePoll({ prompt: "é".repeat(129), options: ["a", "b"] })).toThrow();
    expect(() => normalizePoll({ prompt: "?", options: ["a", "é".repeat(65)] })).toThrow();
    expect(normalizePoll({ prompt: "é".repeat(128), options: ["é".repeat(64), "b"] }).options).toHaveLength(2);
  });

  it("rejects non-finite poll durations", () => {
    expect(() => normalizePoll({ prompt: "Pick", options: ["A", "B"], durationInSeconds: Number.NaN }))
      .toThrow("finite number");
  });
});
