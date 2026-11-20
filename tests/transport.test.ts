import { describe, expect, it } from "vitest";
import { BrowserTransport } from "../src/transport";
import { MockWebSocket } from "./mock-websocket";

class ConnectingWebSocket extends MockWebSocket {
  override readyState = 0;
}

describe("BrowserTransport", () => {
  it("bounds messages queued before the socket opens", () => {
    const transport = new BrowserTransport({
      url: "wss://example.test/socket",
      websocket: ConnectingWebSocket as unknown as typeof WebSocket,
      maxQueuedMessages: 1,
      onOpen: () => undefined,
      onClose: () => undefined,
      onError: () => undefined,
      onMessage: () => undefined
    });
    transport.connect();
    transport.send({ action: "one" });
    expect(() => transport.send({ action: "two" })).toThrow("queue is full");
    transport.disconnect();
  });
});
