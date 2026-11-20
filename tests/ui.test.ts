import { describe, expect, it, vi } from "vitest";
import { GatewayClient, createAuthWidget, createNotificationHistory, createPollingWidget } from "../src";
import { MemoryStorage } from "../src/storage";
import { MockWebSocket, lastSocket, replyToSent, signIn } from "./mock-websocket";

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
    replyToSent(0, { jwt: "jwt" });
  });

  it.each([
    { outcome: "closed socket", expected: "Check the GameLink WebSocket" },
    { outcome: "rejected sign-in", expected: "Check Linked Games" }
  ])("explains a $outcome without echoing credentials", async ({ outcome, expected }) => {
    MockWebSocket.reset();
    const gateway = client();
    const target = document.createElement("div");
    const widget = createAuthWidget(target, gateway);
    try {
      const input = target.querySelector("input")!;
      input.value = "ABC123";
      target.querySelector("form")!.requestSubmit();
      await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
      if (outcome === "closed socket") {
        lastSocket().close();
      } else {
        lastSocket().receive({ meta: { request_id: 1 }, errors: [{ title: "Rejected ABC123" }] });
      }
      const status = target.querySelector('[role="status"]')!;
      await vi.waitFor(() => expect(status.textContent).toContain(expected));
      expect(status.textContent).not.toContain("ABC123");
      expect(input.value).toBe("");
    } finally {
      widget.destroy();
      gateway.dispose();
    }
  });

  it("renders notification history entries", async () => {
    MockWebSocket.reset();
    const target = document.createElement("div");
    const gateway = client();
    await signIn(gateway);
    createNotificationHistory(target, gateway, { clearTimeMs: 5000 });

    const setActions = gateway.setGameActions([{ id: "heal", name: "Heal", description: "Heal", impact: 1 }]);
    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(2));
    replyToSent(0);
    replyToSent(1);
    await setActions;

    lastSocket().receive({
      action: "update",
      params: { target: "twitchPurchaseBits" },
      data: { sku: "heal", id: "tx", cost: 1, username: "viewer" }
    });

    expect(target.textContent).toContain("viewer just bought heal");
  });

  it("renders poll updates", async () => {
    const target = document.createElement("div");
    const gateway = client();
    await signIn(gateway);
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
