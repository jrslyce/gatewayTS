import {
  HypelineClient,
  GameActionCategory,
  GameActionState,
  InfiniteCount,
  createAuthWidget,
  createNotificationHistory,
  PollMode
} from "../../src";

declare const Phaser: any;

const gateway = new HypelineClient({
  gameId: "gamelink-testing",
  stage: "production"
});

createAuthWidget(document.body, gateway);
createNotificationHistory(document.body, gateway);
let coins = 0;

gateway.on("authentication", async ({ hasError }) => {
  if (hasError) return;
  await gateway.setGameMetadata({ name: "Phaser Hypeline Demo" });
  await gateway.setGameTexts([{ label: "Coins", value: "0", icon: "fa-solid:coins" }]);
  await gateway.setGameActions([
    {
      id: "coins",
      name: "Drop Coins",
      description: "Add coins to the player",
      category: GameActionCategory.Help,
      state: GameActionState.Available,
      impact: 2,
      count: InfiniteCount,
      onGameActionUsed: async (used) => {
        coins += 5;
        await gateway.acceptGameAction(used, "Applied viewer action");
        await gateway.setGameTexts([{ label: "Coins", value: String(coins), icon: "fa-solid:coins" }]);
      }
    }
  ]);
});

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 450,
  scene: {
    create(this: any) {
      const label = this.add.text(24, 24, "Coins: 0", { color: "#ffffff" });
      gateway.onActionUsed(() => label.setText(`Coins: ${coins}`));
      this.input.on("pointerdown", () => {
        void gateway.startPoll({
          id: "phaser-next",
          prompt: "Choose the next room",
          options: ["Library", "Garden", "Tower"],
          mode: PollMode.Order,
          durationInSeconds: 30
        });
      });
    }
  }
});
