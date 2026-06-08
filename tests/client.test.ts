import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayClient,
  GameActionCategory,
  GameActionState,
  GATEWAY_EXTENSION_CLIENT_ID,
  InfiniteCount,
  PollMode
} from "../src";
import { MemoryStorage } from "../src/storage";
import { MockWebSocket, lastSocket, sentAt } from "./mock-websocket";

const websocket = MockWebSocket as unknown as typeof WebSocket;

function makeClient(storage = new MemoryStorage()): GatewayClient {
  return new GatewayClient({
    gameId: "gateway-testing",
    stage: "sandbox",
    endpoint: "wss://example.test/socket",
    websocket,
    reconnect: false,
    storage
  });
}

describe("GatewayClient", () => {
  beforeEach(() => {
    MockWebSocket.reset();
  });

  it("connects with an overridable endpoint", async () => {
    const client = makeClient();
    client.connect();
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    expect(lastSocket().url).toBe("wss://example.test/socket");
  });

  it("authenticates with a PIN and stores refresh tokens", async () => {
    const storage = new MemoryStorage();
    const client = makeClient(storage);
    const auth = client.authenticateWithPin("pZV4Se");

    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
    expect(sentAt(0)).toMatchObject({
      action: "authenticate",
      data: {
        pin: "pZV4Se",
        client_id: GATEWAY_EXTENSION_CLIENT_ID,
        game_id: "gateway-testing"
      }
    });

    lastSocket().receive({
      meta: { request_id: 1, action: "authenticate", target: "" },
      data: { jwt: "jwt", refresh: "refresh-token", username: "Streamer" }
    });

    await expect(auth).resolves.toMatchObject({
      jwt: "jwt",
      refreshToken: "refresh-token",
      hasError: false
    });
    expect(storage.getItem("muxy.gateway.gateway-testing.refreshToken")).toBe("refresh-token");
    expect(client.isAuthenticated).toBe(true);
  });

  it("resolves authentication failures with Gateway error details", async () => {
    const client = makeClient();
    const auth = client.authenticateWithPin("EXPIRED");

    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
    lastSocket().receive({
      meta: { request_id: 1, action: "authenticate", target: "" },
      data: null,
      errors: [{ status: 403, title: "Forbidden", detail: "Invalid authorization token" }]
    });

    await expect(auth).resolves.toMatchObject({
      hasError: true,
      errors: [{ detail: "Invalid authorization token" }]
    });
    expect(client.isAuthenticated).toBe(false);
  });

  it("publishes Unity-compatible actions to gatewayActions", async () => {
    const client = makeClient();
    const setActions = client.setGameActions([
      {
        id: "healthpack",
        name: "Spawn Healthpack",
        description: "Spawn a healthpack near the player",
        icon: "fa-solid:heart",
        category: GameActionCategory.Help,
        state: GameActionState.Available,
        impact: 2,
        count: InfiniteCount
      }
    ]);

    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(2));
    expect(sentAt(0)).toMatchObject({
      action: "subscribe",
      params: { target: "twitchPurchaseBits" },
      data: { sku: "*" }
    });
    lastSocket().receive({ meta: { request_id: 1, action: "subscribe" }, data: { ok: true } });

    expect(sentAt(1)).toMatchObject({
      action: "set",
      params: { target: "gatewayActions" },
      data: {
        actions: [
          {
            id: "healthpack",
            category: "help",
            state: "available",
            impact: 2
          }
        ]
      }
    });

    lastSocket().receive({ meta: { request_id: 2, action: "set" }, data: { ok: true } });
    await expect(setActions).resolves.toMatchObject({ data: { ok: true } });
  });

  it("routes transaction updates to bits and action callbacks", async () => {
    const client = makeClient();
    const actionSpy = vi.fn();
    const bitsSpy = vi.fn();
    client.onBitsUsed(bitsSpy);
    client.onActionUsed(actionSpy);

    const setActions = client.setGameActions([
      {
        id: "killplayer",
        name: "Kill Player",
        description: "Restart the level",
        impact: 5,
        onGameActionUsed: actionSpy
      }
    ]);

    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(2));
    lastSocket().receive({ meta: { request_id: 1 }, data: { ok: true } });
    lastSocket().receive({ meta: { request_id: 2 }, data: { ok: true } });
    await setActions;

    lastSocket().receive({
      action: "update",
      params: { request_id: 0xffff, target: "twitchPurchaseBits" },
      data: {
        sku: "killplayer",
        cost: 100,
        userId: "123",
        id: "tx-1",
        username: "viewer"
      }
    });

    expect(bitsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "tx-1", sku: "killplayer", bits: 100 })
    );
    expect(actionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: "tx-1", actionId: "killplayer", cost: 100 })
    );
  });

  it("publishes metadata and game text in Unity-compatible targets", async () => {
    const client = makeClient();

    const metadata = client.setGameMetadata({ name: "Professor Toast", logo: "", theme: "neon-toast" });
    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
    expect(sentAt(0)).toMatchObject({
      action: "set",
      params: { target: "gameMetadata" },
      data: { name: "Professor Toast", logo: "", theme: "neon-toast" }
    });
    lastSocket().receive({ meta: { request_id: 1 }, data: { ok: true } });
    await metadata;

    const texts = client.setGameTexts([
      { label: "Distance", value: "12m", icon: "" },
      { label: "Toast Heat", value: "4", icon: "" }
    ]);
    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(3));
    expect(sentAt(2)).toMatchObject({
      action: "patch",
      params: { target: "state" },
      data: {
        state_id: "channel",
        state: [
          {
            op: "add",
            path: "/game/text/game_data",
            value: [
              { label: "Distance", value: "12m", icon: "" },
              { label: "Toast Heat", value: "4", icon: "" }
            ]
          }
        ]
      }
    });
    lastSocket().receive({ meta: { request_id: 2 }, data: { ok: true } });
    lastSocket().receive({ meta: { request_id: 3 }, data: { ok: true } });
    await texts;
  });

  it("creates polls and translates poll updates", async () => {
    const client = makeClient();
    const pollSpy = vi.fn();
    client.onPollUpdate(pollSpy);

    const started = client.startPoll({
      id: "next-level",
      prompt: "Next level?",
      options: ["Ice", "Desert", "Jungle"],
      mode: PollMode.Order,
      durationInSeconds: 0
    });

    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
    expect(sentAt(0)).toMatchObject({
      action: "create",
      params: { target: "poll" },
      data: {
        poll_id: "next-level",
        prompt: "Next level?",
        options: ["Ice", "Desert", "Jungle"]
      }
    });

    lastSocket().receive({ meta: { request_id: 1 }, data: { ok: true } });
    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(2));
    lastSocket().receive({ meta: { request_id: 2 }, data: { ok: true } });
    await started;

    lastSocket().receive({
      action: "update",
      params: { request_id: 0xffff, target: "poll" },
      data: { topic_id: "next-level", results: [2, 9, 4] }
    });

    expect(pollSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pollId: "next-level",
        winner: 1,
        winningVoteCount: 9,
        count: 15,
        isFinal: false
      })
    );
  });
});
