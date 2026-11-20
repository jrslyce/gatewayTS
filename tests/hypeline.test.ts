import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayClient, HypelineClient, type HypelineClientOptions } from "../src";
import { resolveEndpoint } from "../src/protocol";
import { MemoryStorage } from "../src/storage";
import { lastSocket, MockWebSocket, replyToSent, sentAt, signIn } from "./mock-websocket";

const action = { id: "heal", name: "Heal", impact: 1, description: "", count: 3 };
const clients: HypelineClient[] = [];
function client(options: Partial<HypelineClientOptions> = {}) {
  const game = new HypelineClient({
    gameId: "my-game", websocket: MockWebSocket, reconnect: false, storage: new MemoryStorage(), ...options
  });
  clients.push(game);
  return game;
}

beforeEach(() => MockWebSocket.reset());
afterEach(() => {
  clients.splice(0).forEach(game => game.dispose());
  vi.useRealTimers();
});

describe("Hypeline compatibility and authentication", () => {
  it("uses the same client for both names and restores the legacy production key", async () => {
    expect(HypelineClient).toBe(GatewayClient);
    const storage = new MemoryStorage();
    storage.setItem("muxy.gateway.my-game.refreshToken", "old-session");
    const game = client({ gameId: " My-Game ", storage });
    const login = game.authenticateWithRefreshToken();
    expect(sentAt(0)).toMatchObject({ data: { game_id: "my-game", refresh: "old-session" } });
    replyToSent(0, { refresh: "new-session", jwt: "jwt" });
    await login;
    game.runInStaging();
    expect(game.refreshToken).toBe("");
    expect(storage.getItem("muxy.gateway.my-game.refreshToken")).toBe("new-session");
    expect(() => client({ gameId: "two--parts" })).toThrow("Game ID");
  });

  it("redacts authentication frames, including a reply without an action label", async () => {
    const storage = new MemoryStorage();
    const game = client({ rememberSession: false, storage });
    const trace: unknown[] = [];
    game.on("request", e => trace.push(e));
    game.on("message", e => trace.push(e));
    game.on("debug", e => trace.push(e));
    const login = game.authenticateWithPin(" abc123 ");
    expect(sentAt(0)).toMatchObject({ data: { pin: "ABC123" } });
    lastSocket().receive({ meta: { request_id: 1 }, data: { jwt: "secret-jwt", refresh: "secret-refresh" } });
    expect((await login).refreshToken).toBe("secret-refresh");
    expect(JSON.stringify(trace)).not.toMatch(/ABC123|secret-jwt|secret-refresh/);
    expect(storage.getItem("muxy.gateway.my-game.refreshToken")).toBeNull();
    await game.deauthenticate();
    expect(game.refreshToken).toBe("");
  });

  it("keeps state unpublished when a login gets an empty success envelope", async () => {
    const game = client();
    const pending = expect(game.setGameMetadata({ name: "My Game" })).rejects.toThrow("Authentication failed");
    const login = game.authenticateWithPin("ABC123");
    replyToSent(0, {});
    expect((await login).hasError).toBe(true);
    expect(game.isAuthenticated).toBe(false);
    await pending;
    expect(lastSocket().sent).toHaveLength(1);
  });

  it("resolves only secure remote or explicit local test endpoints", () => {
    for (const host of ["localhost", "127.0.0.42", "[::1]"]) {
      const url = "ws://" + host + ":9000/test";
      expect(resolveEndpoint("production", url)).toBe(url);
    }
    for (const url of ["ws://game.example", "ws://localhost.example", "https://game.example", "wss://a:b@game.example"]) {
      expect(() => resolveEndpoint("production", () => url)).toThrow();
    }
  });
});

describe("published state and viewer actions", () => {
  it("coalesces offline text writes and resolves both callers with the actual acknowledgment", async () => {
    const game = client();
    const first = game.setGameTexts([{ label: "Health", value: "50" }]);
    const second = game.setGameTexts([{ label: "Health", value: "60" }]);
    expect(lastSocket().sent).toHaveLength(0);
    const login = game.authenticateWithPin("ABC123");
    replyToSent(0, { jwt: "jwt" });
    await login;
    expect(lastSocket().sent).toHaveLength(2);
    expect(sentAt(1)).toMatchObject({ data: { state: [{ value: [{ value: "60" }] }] } });
    replyToSent(1, { revision: 7 });
    expect((await first).data).toEqual({ revision: 7 });
    expect(await second).toEqual(await first);
  });

  it("changes only the selected action and keeps inventory distinct from its maximum", async () => {
    const game = client();
    await signIn(game);
    const publish = game.setGameActions([action]);
    replyToSent(0); replyToSent(1);
    await publish;
    const writes = [
      game.setMaximumGameActionCount("heal", 8), game.setGameActionCount("heal", 2),
      game.incrementGameActionCount("heal", 3), game.decrementGameActionCount("heal", 1),
      game.disableGameAction("heal"), game.enableGameAction("heal")
    ];
    const changes = [{ count: 8 }, { inventory: 2 }, { delta_inventory: { change: 3 } },
      { delta_inventory: { change: -1 } }, { state: "unavailable" }, { state: "available" }];
    changes.forEach((change, index) => {
      expect(sentAt(index + 2)).toMatchObject({
        action: "set", params: { target: "gatewayActionState" }, data: { id: "heal", ...change }
      });
      replyToSent(index + 2);
    });
    await Promise.all(writes);
    const text = game.setGameTexts([{ label: "Health", value: "60" }]);
    expect(lastSocket().sent).toHaveLength(9);
    expect(sentAt(8)).toMatchObject({ action: "patch", params: { target: "state" } });
    replyToSent(8);
    await text;
  });

  it("keeps working callbacks after a rejected edit and delivers a repeated transaction once", async () => {
    const logger = { ...console, warn: vi.fn() };
    const game = client({ logger });
    await signIn(game);
    const effect = vi.fn();
    const observed = vi.fn();
    game.onActionUsed(() => { throw new Error("game listener failed"); });
    game.onActionUsed(observed);
    const publish = game.setGameActions([{ ...action, onGameActionUsed: effect }]);
    replyToSent(0); replyToSent(1);
    await publish;
    await expect(game.setGameActions([action, action])).rejects.toThrow("Duplicate");
    const event = { action: "update", params: { target: "twitchPurchaseBits" }, data: { sku: "heal", id: "tx" } };
    lastSocket().receive(event);
    lastSocket().receive(event);
    expect(effect).toHaveBeenCalledTimes(1);
    expect(observed).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("socket lifecycle", () => {
  it("removes timed-out sends before a connecting socket can flush them", async () => {
    class Connecting extends MockWebSocket { override readyState = 0; }
    vi.useFakeTimers();
    const game = client({ websocket: Connecting, requestTimeoutMs: 10 });
    const failure = expect(game.authenticateWithPin("ABC123")).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(11);
    await failure;
    lastSocket().readyState = MockWebSocket.OPEN;
    lastSocket().onopen?.(new Event("open"));
    expect(lastSocket().sent).toEqual([]);
  });

  it("refreshes before resubscribing and ignores an obsolete socket callback", async () => {
    vi.useFakeTimers();
    const game = client({ reconnect: { initialDelayMs: 10, jitter: false } });
    await signIn(game);
    const subscription = game.subscribeToTransactions();
    replyToSent(0);
    await subscription;
    const oldMessage = lastSocket().onmessage!;
    lastSocket().close();
    expect(game.isAuthenticated).toBe(false);
    const update = game.setGameTexts([{ label: "Health", value: "60" }]);
    await vi.advanceTimersByTimeAsync(11);
    expect(lastSocket().sent).toHaveLength(1);
    expect(sentAt(0)).toMatchObject({ action: "authenticate", data: { refresh: "test-refresh" } });
    oldMessage(new MessageEvent("message", { data: JSON.stringify({ meta: { request_id: 3 }, data: { jwt: "stale" } }) }));
    expect(game.isAuthenticated).toBe(false);
    replyToSent(0, { jwt: "new", username: "Streamer" });
    await vi.advanceTimersByTimeAsync(0);
    expect(sentAt(1)).toMatchObject({ action: "subscribe" });
    expect(sentAt(2)).toMatchObject({ action: "patch" });
    replyToSent(1); replyToSent(2);
    await update;
    game.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(() => game.connect()).toThrow("closed");
  });

  it.each([new Uint8Array([0]), "é".repeat(8 * 1024 * 1024 + 1)])(
    "closes on a protocol violation without retrying", async (data) => {
      vi.useFakeTimers();
      const game = client({ reconnect: { initialDelayMs: 5 }, autoConnect: true });
      const error = vi.fn();
      game.on("error", error);
      lastSocket().onmessage?.(new MessageEvent("message", { data }));
      await vi.advanceTimersByTimeAsync(500);
      expect(error).toHaveBeenCalledTimes(1);
      expect(MockWebSocket.instances).toHaveLength(1);
      expect(lastSocket().readyState).toBe(MockWebSocket.CLOSED);
    }
  );

  it("disposes pending auth and poll timers without creating another socket", async () => {
    const game = client();
    await signIn(game);
    const poll = game.startPoll({ id: "short", prompt: "Pick", options: ["A", "B"], durationInSeconds: 1 });
    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(1));
    replyToSent(0);
    await vi.waitFor(() => expect(lastSocket().sent).toHaveLength(2));
    vi.useFakeTimers();
    replyToSent(1);
    await poll;
    const pending = game.authenticateWithPin("ABC123");
    game.dispose();
    await expect(pending).rejects.toThrow("closed");
    await vi.advanceTimersByTimeAsync(1500);
    expect(lastSocket().sent).toHaveLength(3);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("flushes logout to the open socket and bounds the wait when it cannot drain", async () => {
    class BusySocket extends MockWebSocket { bufferedAmount = 99; }
    vi.useFakeTimers();
    const game = client({ websocket: BusySocket });
    await signIn(game);
    const logout = game.deauthenticate();
    expect(sentAt(0)).toMatchObject({ action: "deauthenticate" });
    expect(lastSocket().readyState).toBe(MockWebSocket.OPEN);
    await vi.advanceTimersByTimeAsync(1010);
    await logout;
    expect(lastSocket().readyState).toBe(MockWebSocket.CLOSED);
  });
});
