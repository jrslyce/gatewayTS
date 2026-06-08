import {
  GatewayClient,
  GameActionCategory,
  GameActionState,
  InfiniteCount,
  createAuthWidget
} from "../../src";

declare const PIXI: any;

const gateway = new GatewayClient({
  gameId: "gateway-testing",
  stage: "sandbox"
});

const ui = document.querySelector("#gateway-ui");
if (ui instanceof HTMLElement) {
  createAuthWidget(ui, gateway);
}

const app = new PIXI.Application({ width: 800, height: 450, background: "#111827" });
document.body.appendChild(app.view);

const text = new PIXI.Text("Shields: 0", { fill: "#ffffff" });
text.x = 24;
text.y = 24;
app.stage.addChild(text);

let shields = 0;

await gateway.setGameMetadata({ name: "Pixi Gateway Demo" });
await gateway.setGameTexts([{ label: "Shields", value: "0", icon: "fa-solid:shield" }]);
await gateway.setGameActions([
  {
    id: "shield",
    name: "Add Shield",
    description: "Give the player a shield",
    category: GameActionCategory.Help,
    state: GameActionState.Available,
    impact: 2,
    count: InfiniteCount,
    onGameActionUsed: async () => {
      shields += 1;
      text.text = `Shields: ${shields}`;
      await gateway.setGameTexts([{ label: "Shields", value: String(shields), icon: "fa-solid:shield" }]);
    }
  }
]);
