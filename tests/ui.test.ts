import { describe, expect, it, vi } from "vitest";
import { GatewayClient, createAuthWidget, createNotificationHistory, createPollingWidget } from "../src";
import { MemoryStorage } from "../src/storage";
import { MockWebSocket, lastSocket } from "./mock-websocket";

const websocket = MockWebSocket as unknown as typeof WebSocket;

function client(): GatewayClient {
  return new GatewayClient({
    gameId: "gateway-testing",
    endpoint: "wss://example.test/socket",
    websocket,
    reconnect: false,
    storage: new MemoryStorage()
  });
}

describe("UI helpers", () => {
  it("creates an auth widget that authenticates with a PIN", async () => {
    MockWebSocket.reset();
    const target = document.createElement("div");
    const gateway = client();
    createAuthWidget(target, gateway);

    const input = target.querySelector("input") as HTMLInputElement;
    const form = target.querySelector("form") as HTMLFormElement;
    input.value = "ABC123";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
    expect(lastSocket().sent[0]).toContain("ABC123");
  });

  it("renders notification history entries", async () => {
    MockWebSocket.reset();
    const target = document.createElement("div");
    const gateway = client();
    createNotificationHistory(target, gateway, { clearTimeMs: 5000 });

    const setActions = gateway.setGameActions([{ id: "heal", name: "Heal", description: "Heal", impact: 1 }]);
    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(2));
    lastSocket().receive({ meta: { request_id: 1 }, data: { ok: true } });
    lastSocket().receive({ meta: { request_id: 2 }, data: { ok: true } });
    await setActions;

    lastSocket().receive({
      action: "update",
      params: { target: "twitchPurchaseBits" },
      data: { sku: "heal", id: "tx", cost: 1, username: "viewer" }
    });

    expect(target.textContent).toContain("viewer just bought heal");
  });

  it("renders poll updates", () => {
    const target = document.createElement("div");
    const gateway = client();
    createPollingWidget(target, gateway);

    gateway.sendRaw({
      action: "update",
      params: { target: "poll" },
      data: { topic_id: "poll", results: [1, 3] }
    });

    lastSocket().receive({
      action: "update",
      params: { target: "poll" },
      data: { topic_id: "poll", results: [1, 3] }
    });

    expect(target.textContent).toContain("3");
  });
});
