# Hypeline for HTML5 games

New to the SDK? Start with the [interactive HTML5 walkthrough](https://muxy.github.io/hypeline-html5/) or give your coding agent the [installation prompt](../site/install-hypeline.md).

Hypeline runs inside the broadcaster's game. A viewer chooses an action in the **Muxy Gateway** Twitch extension, your game applies the effect, and the game reports the outcome to GameLink.

## Connect a broadcaster

1. Register your game's permanent ID at [the Muxy developer portal](https://dev.muxy.io/games). Use `gamelink-testing` for a sample. IDs are 3–64 lowercase letters or digits with optional single hyphens between them. The client trims whitespace and lowercases the ID.
2. Have the broadcaster install and activate the Muxy Gateway extension on their channel. In its configuration, allow your game if Linked Games lists it, then request a new six-character code.
3. Use the [auth widget](https://muxy.github.io/hypeline-html5/#setup) or pass the code to `authenticateWithPin(code)`. The client trims and uppercases it. Check `response.hasError` before publishing. Connection failures and timeouts reject the promise. Keep the authentication result private because it contains credentials.

The default stage is `production`, including tests on your own channel. `staging` is for Muxy's internal environment. The hosted sandbox is retired. Existing test harnesses can still use the `sandbox` value with an explicit test endpoint.

The client requires `wss://` for remote WebSockets. A local test server can use `ws://localhost`, IPv4 loopback, or `ws://[::1]`. When using a proxy, keep its upstream connection encrypted and forward the browser's Origin. The service must accept the game's origin. Browsers validate the server's TLS certificate.

## Handle an action and report the outcome

Register the notification widget once, then publish your actions after successful authentication. Use one handler to apply the effect and submit its outcome. This example assumes the game provides `player` and a visible host element named `hud`.

```ts
import {
  HypelineClient, GameActionCategory, GameActionState, createNotificationHistory
} from "muxy-gateway-html5";

const game = new HypelineClient({ gameId: "gamelink-testing" });
const alerts = createNotificationHistory(hud, game, {
  messageTemplate: "{Username} selected {ActionID}"
});

async function publishActions() {
  await game.setGameActions([{
    id: "healthpack",
    name: "Spawn Healthpack",
    description: "Restore up to 10 health",
    impact: 1,
    category: GameActionCategory.Help,
    state: GameActionState.Available,
    count: 3,
    onGameActionUsed: async (used) => {
      if (player.health >= player.maxHealth) {
        await game.refundGameAction(used, "Health is full");
        return;
      }
      player.health = Math.min(player.health + 10, player.maxHealth);
      await game.acceptGameAction(used, "Restored health");
      await game.setGameTexts([{ label: "Health", value: String(player.health) }]);
    }
  }]);
}
```

Call `publishActions()` when initializing the inventory. Publishing the full list sets the remaining stock from each action's configured count. A successful fulfill/refund promise contains the server response. After a timeout the outcome can be unknown. Reconcile that transaction before retrying or refunding. The client suppresses the most recent 1,024 transaction IDs for the current broadcaster across automatic reconnects. Games that need recovery across reloads must persist their own fulfillment records. `onActionUsed` and the per-action callback both observe the event. A HUD listener can display it without applying the gameplay effect again.

## Update stock and game state

| Method | Server effect |
| --- | --- |
| `setGameTexts(texts)` | Replace the displayed game text. Action inventory is preserved. |
| `setGameMetadata(metadata)` | Replace the game name, logo, and theme together. |
| `setGameActions(actions)` | Publish the full action catalog and its starting counts. |
| `setMaximumGameActionCount(id, n)` | Set the maximum for one registered action. |
| `setGameActionCount(id, n)` | Set its remaining inventory. |
| `incrementGameActionCount(id, n)` / `decrementGameActionCount(id, n)` | Apply a relative change on the server. |
| `enableGameAction(id)` / `disableGameAction(id)` | Change availability for one registered action. |

Register actions with unique, nonblank IDs up to 64 characters. Use an integer impact of 0–5 and counts from 0 through `InfiniteCount` (65,535). The game name is limited to 256 UTF-8 bytes and the logo string to 1 MiB. An invalid action list leaves the previous callbacks intact.

Metadata, catalog, and text setters called before sign-in wait for authentication. Repeated writes to one of those sections share the acknowledgment for its newest value. Start authentication independently of any setters waiting for it. A request times out after `requestTimeoutMs` (30 seconds by default). Disconnecting rejects outstanding requests. Individual inventory changes, polls, subscriptions, and transaction fulfillment require a signed-in session.

## Run a viewer poll

```ts
await game.startPoll({
  id: "next-room",
  prompt: "Where should we go next?",
  options: ["Library", "Garden"],
  durationInSeconds: 30,
  onPollUpdate(update) {
    if (update.isFinal && update.count > 0) chooseRoom(update.winner);
  }
});
```

Supply 2–10 options. The prompt can use up to 256 UTF-8 bytes, each option up to 128. A duration of zero leaves the poll open until stopped. Starting a replacement closes the previous poll first. Call `stopPoll(true)` to emit a final update with the most recently received vote totals.

## Sessions and cleanup

By default the browser persists the refresh token under the existing per-game production key. Set `rememberSession: false` for an in-memory session, or provide a `StorageAdapter` and `storageKey`. Staging and legacy sandbox tests use separate keys. On a subsequent page visit, check `game.refreshToken` and call `authenticateWithRefreshToken()` to restore the saved session. Authentication traces omit credential payloads. Handle the actual authentication response only where the game needs it.

After an unexpected disconnect, the client retries with backoff, restores an active session when it has a refresh token, and restores its transaction subscriptions after sign-in. The default outgoing queue holds up to 100 unsent messages. An expired tracked request is removed from that queue. Binary or oversized incoming messages (over 16 MiB) stop the connection. Fix the cause before explicitly reconnecting.

On unlink, call `clearGameState()` while signed in, then use `deauthenticate()` in a `finally` block to clear the saved session and sign out. Logout allows up to one second for buffered sends to drain. That flush is a local delivery step. When unmounting a game, destroy its widgets (for example, `alerts.destroy()`) and call `game.dispose()` to release its socket, timers, and listeners. A disposed client cannot reconnect.

## Migrate a Gateway integration

| Existing integration | Hypeline equivalent |
| --- | --- |
| `GatewayClient` / `GatewayClientOptions` | `HypelineClient` / `HypelineClientOptions` |
| `MuxyGatewayHTML5.GatewayClient` | `HypelineHTML5.HypelineClient` |
| `GatewayEnvelope` / `GatewayError` | `HypelineEnvelope` / `HypelineError` |

Both sets of names resolve to the same implementation. The package name `muxy-gateway-html5`, existing production storage keys, CSS classes, Twitch extension ID, and GameLink protocol identifiers retain their Gateway spelling. Update any remote plaintext endpoint overrides to WSS, replace hosted sandbox configuration with production, and move command calls into your successful sign-in flow.

## Verify a game on your channel

Use the production Game ID and an HTTPS build at the game's actual origin. Set a test action to zero cost on your channel. With a separate viewer session, trigger the action once, observe the viewer alert and gameplay effect, await the acknowledgment, then change a health label and check that the action's remaining stock stays consumed. Disconnect and reconnect and verify a second action still arrives once. A local simulator checks game logic only.

[Unity integration walkthrough](https://muxy.github.io/hypeline-unity/) · [GameLink action messages](https://github.com/muxy/gamelink-cpp/blob/16c6b9796ae02105153ac33482d83ac609398d2e/src/gateway_actions.cpp)

## Work on the SDK and examples

From the SDK checkout, run `npm ci` with Node.js 24. Use `npm run dev:tutorial` for the [vanilla healthpack demo](../../examples/vanilla) or `npm run dev:side-runner` for the [side-runner game](../../examples/side-runner). The [Phaser](../../examples/phaser) and [PixiJS](../../examples/pixi) examples show how to connect the SDK to a game engine.

Run `npm run check`, `npm test`, and `npm run build` to verify the SDK. The build produces ESM, CommonJS, TypeScript declarations, and the browser bundle.

Edit the walkthrough and agent prompt in [docs/site](../site). Build from the commit you want readers to use with `npm run docs:build`, then preview it with `npx vite preview --outDir site-dist`. To publish, copy the contents of `site-dist/`, including `.nojekyll`, into a separate checkout of `gh-pages`. Remove obsolete generated assets, review the diff, and commit and push the publishing branch.
