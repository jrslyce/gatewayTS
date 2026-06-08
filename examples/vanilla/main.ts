import {
  GatewayClient,
  GameActionCategory,
  GameActionState,
  InfiniteCount,
  PollMode,
  createAuthWidget,
  createNotificationHistory,
  createPollingWidget
} from "../../src";

const client = new GatewayClient({
  gameId: "gateway-testing",
  stage: "sandbox"
});

const ui = document.querySelector("#gateway-ui") as HTMLElement;
createAuthWidget(ui, client);
createNotificationHistory(ui, client);
createPollingWidget(ui, client);

const canvas = document.querySelector("#game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
let health = 50;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#93c5fd";
  ctx.fillRect(40, 180, Math.max(0, health) * 5, 32);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "20px system-ui";
  ctx.fillText(`Health: ${health}`, 40, 160);
  requestAnimationFrame(draw);
}

draw();

await client.setGameMetadata({ name: "Vanilla Gateway Demo", theme: "default" });
await client.setGameTexts([{ label: "Health", value: String(health), icon: "fa-solid:heart" }]);
await client.setGameActions([
  {
    id: "heal",
    name: "Heal Player",
    description: "Restore 10 health",
    icon: "fa-solid:heart",
    category: GameActionCategory.Help,
    state: GameActionState.Available,
    impact: 1,
    count: InfiniteCount,
    onGameActionUsed: async () => {
      health = Math.min(100, health + 10);
      await client.setGameTexts([{ label: "Health", value: String(health), icon: "fa-solid:heart" }]);
    }
  }
]);

document.querySelector("#poll")?.addEventListener("click", () => {
  void client.startPoll({
    id: "next-color",
    prompt: "What color should the bar be?",
    options: ["Blue", "Green", "Pink"],
    mode: PollMode.Order,
    durationInSeconds: 30
  });
});
