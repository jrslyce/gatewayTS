import {
  GatewayClient,
  GameActionCategory,
  GameActionState,
  InfiniteCount,
  PollMode
} from "../../src";

declare const Phaser: any;

const gateway = new GatewayClient({
  gameId: "gateway-testing",
  stage: "sandbox"
});

let coins = 0;

await gateway.setGameMetadata({ name: "Phaser Gateway Demo" });
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
    onGameActionUsed: async () => {
      coins += 5;
      await gateway.setGameTexts([{ label: "Coins", value: String(coins), icon: "fa-solid:coins" }]);
    }
  }
]);

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
