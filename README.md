# Muxy Hypeline for HTML5

Let Twitch viewers trigger actions and vote in polls in your browser game.

[Read the Hypeline HTML5 developer guide](https://muxy.github.io/hypeline-html5/) to connect a broadcaster, add a viewer action, and test it with the healthpack demo. To set up the SDK with a coding agent, use the [installation prompt](https://muxy.github.io/hypeline-html5/#agent).

For a plain HTML game, save the [browser SDK](https://muxy.github.io/hypeline-html5/sdk/index.global.js) beside your HTML file and load it before your game script.

```html
<script src="./index.global.js"></script>
```

For TypeScript or a bundler, follow the [source installation steps](https://muxy.github.io/hypeline-html5/#install) to build and install the private `muxy-gateway-html5` package. Include the SDK commit from that step when reporting test results.

Hypeline supports existing Muxy Gateway integrations. See the [SDK license](LICENSE) and [upstream notices](NOTICE.md).
