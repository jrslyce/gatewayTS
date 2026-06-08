# Muxy Gateway HTML5

TypeScript-first HTML5 SDK for adding Muxy Gateway-style Twitch viewer
interactivity to browser games.

This package is a browser-native rewrite of the core ideas in
`muxy/gateway-unity`: authentication, automatic refresh-token persistence,
game metadata, game text, viewer actions, action validation/refund hooks,
polling, Twitch Bits transaction events, reconnecting WebSocket transport, and
optional prefab-like widgets.

## Install

```sh
npm install
npm run build
```

The package emits ESM, CommonJS, and browser global bundles in `dist/`.

## Quick Start

```ts
import {
  GatewayClient,
  GameActionCategory,
  GameActionState,
  InfiniteCount
} from "muxy-gateway-html5";

const gateway = new GatewayClient({
  gameId: "gateway-testing",
  stage: "sandbox",
  autoConnect: true
});

await gateway.authenticateWithPin("PIN_FROM_EXTENSION");

await gateway.setGameMetadata({
  name: "My HTML5 Game",
  theme: "default"
});

await gateway.setGameTexts([
  { label: "Current Level", value: "Menu", icon: "fa-solid:dungeon" }
]);

await gateway.setGameActions([
  {
    id: "healthpack",
    name: "Spawn Healthpack",
    description: "Spawn a healthpack near the player",
    icon: "fa-solid:heart",
    category: GameActionCategory.Help,
    state: GameActionState.Available,
    impact: 2,
    count: InfiniteCount,
    onGameActionUsed: () => spawnHealthpack()
  }
]);
```

## UI Helpers

```ts
import {
  createAuthWidget,
  createNotificationHistory,
  createPollingWidget
} from "muxy-gateway-html5";

const container = document.querySelector("#gateway-ui") as HTMLElement;
createAuthWidget(container, gateway);
createNotificationHistory(container, gateway);
createPollingWidget(container, gateway);
```

## Endpoint Notes

The Unity package delegates WebSocket URL derivation to the native
`cgamelink` library. This browser SDK exposes the endpoint as an override:

```ts
const gateway = new GatewayClient({
  gameId: "gateway-testing",
  stage: "sandbox",
  endpoint: "wss://your-confirmed-gamelink-endpoint"
});
```

Defaults are provided for the documented production and sandbox API hosts, but
real Gateway deployments should confirm the active GameLink WebSocket endpoint
for the game ID before going live.

## Examples

- `examples/vanilla`
- `examples/phaser`
- `examples/pixi`

Each example shows authentication, one action, one game text update, and a poll.

## Reference

The upstream Unity package is preserved under `reference/gateway-unity/`.
