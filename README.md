# Hypecade HTML5 SDK

Connect an HTML5 game to the Muxy Gateway Twitch extension. Hypecade handles broadcaster sign-in, viewer actions, Bits transactions, game text, and polls. It works with browser JavaScript and TypeScript, including Phaser and PixiJS.

## Build and run the sample

From this checkout with Node.js 24 and npm installed, run

```sh
npm ci
npm run build
npm run dev:side-runner
```

Open the local URL printed by Vite. **Demo** lets you try viewer effects locally. For Twitch delivery, link your broadcaster account and start a Hypecade run. The example uses the shared `gamelink-testing` Game ID.

## Add Hypecade to your game

Build this private package from source. To use it from a separate game project, run `npm pack` in this checkout and install the resulting tarball in the game. The existing package name is `muxy-gateway-html5`.

```ts
import {
  HypecadeClient, createAuthWidget, createNotificationHistory
} from "muxy-gateway-html5";

const game = new HypecadeClient({ gameId: "gamelink-testing" });
const panel = document.getElementById("stream-interactivity")!;
createAuthWidget(panel, game);
createNotificationHistory(panel, game);

game.on("authentication", async ({ hasError }) => {
  if (hasError) return;
  await game.setGameMetadata({ name: "My game" });
  await game.setGameTexts([{ label: "Health", value: "50" }]);
});
```

Add a `<div id="stream-interactivity"></div>` to the page. For a plain script tag, load `dist/index.global.js` and use `HypecadeHTML5.HypecadeClient`. ESM, CommonJS, and TypeScript declarations are included in `dist/`.

[Read the Hypecade developer guide](docs/hypecade/index.md) for actions and fulfillment, inventory, sessions, polls, and migration from Gateway. Existing `GatewayClient` imports, the `MuxyGatewayHTML5` browser global, and the package entry points still work.

## Development

```sh
npm run check
npm test
npm run build
```

The [vanilla](examples/vanilla), [Phaser](examples/phaser), and [PixiJS](examples/pixi) examples show engine integration. The [side-runner](examples/side-runner) includes a playable game and a local simulator.
