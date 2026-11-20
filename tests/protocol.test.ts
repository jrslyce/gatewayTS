import { describe, expect, it } from "vitest";
import { createRequest, requestIdOf, resolveEndpoint } from "../src/protocol";
import { DEFAULT_PRODUCTION_ENDPOINT, DEFAULT_STAGING_ENDPOINT } from "../src";
import { toPollUpdate } from "../src/poll";

describe("protocol helpers", () => {
  it("creates request envelopes", () => {
    expect(createRequest("subscribe", 42, "poll", { topic_id: "*" })).toEqual({
      action: "subscribe",
      params: { request_id: 42, target: "poll" },
      data: { topic_id: "*" }
    });
  });

  it("resolves default endpoints", () => {
    expect(resolveEndpoint("production")).toBe(DEFAULT_PRODUCTION_ENDPOINT);
    expect(resolveEndpoint("staging")).toBe(DEFAULT_STAGING_ENDPOINT);
    expect(() => resolveEndpoint("sandbox")).toThrow("retired");
    expect(resolveEndpoint("production", "wss://custom")).toBe("wss://custom");
  });

  it("extracts request ids from request and response envelopes", () => {
    expect(requestIdOf({ params: { request_id: 7 } })).toBe(7);
    expect(requestIdOf({ meta: { request_id: 8 } })).toBe(8);
  });
});

describe("poll helpers", () => {
  it("calculates winners and weighted means", () => {
    expect(toPollUpdate("poll", [4, 8, 2])).toMatchObject({
      winner: 1,
      winningVoteCount: 8,
      count: 14,
      mean: 0.8571428571428571
    });
  });
});
