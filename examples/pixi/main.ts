import {
  HypecadeClient,
  GameActionCategory,
  GameActionState,
  InfiniteCount,
  createAuthWidget,
  createNotificationHistory
} from "../../src";

declare const PIXI: any;

const gateway = new HypecadeClient({
  gameId: "gamelink-testing",
  stage: "production"
});

const ui = document.querySelector("#gateway-ui");
if (ui instanceof HTMLElement) {
  createAuthWidget(ui, gateway);
  createNotificationHistory(ui, gateway);
}

const app = new PIXI.Application({ width: 800, height: 450, background: "#111827" });
document.body.appendChild(app.view);

const text = new PIXI.Text("Shields: 0", { fill: "#ffffff" });
text.x = 24;
text.y = 24;
app.stage.addChild(text);

let shields = 0;

gateway.on("authentication", async ({ hasError }) => {
  if (hasError) return;
  await gateway.setGameMetadata({ name: "Pixi Hypecade Demo" });
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
      onGameActionUsed: async (used) => {
        shields += 1;
        text.text = `Shields: ${shields}`;
        await gateway.acceptGameAction(used, "Applied viewer action");
        await gateway.setGameTexts([{ label: "Shields", value: String(shields), icon: "fa-solid:shield" }]);
      }
    }
  ]);
});
