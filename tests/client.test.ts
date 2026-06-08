import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GatewayClient,
  GameActionCategory,
  GameActionState,
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
      data: { pin: "pZV4Se", client_id: "gateway-testing" }
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

  it("publishes Unity-compatible actions in channel state", async () => {
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
      params: { target: "transaction_complete" },
      data: { sku: "*" }
    });
    lastSocket().receive({ meta: { request_id: 1, action: "subscribe" }, data: { ok: true } });

    expect(sentAt(1)).toMatchObject({
      action: "set",
      params: { target: "channel" },
      data: {
        state: {
          gateway: {
            game_id: "gateway-testing",
            actions: [
              {
                id: "healthpack",
                category: GameActionCategory.Help,
                state: GameActionState.Available,
                impact: 2
              }
            ]
          }
        }
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
      params: { request_id: 0xffff, target: "transaction_complete" },
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
