import {
  HypelineClient, GameActionCategory, GameActionState, PollMode,
  createAuthWidget, createPollingWidget
} from "../../src";

const client = new HypelineClient({
  gameId: "gamelink-testing",
  rememberSession: false
});

const ui = document.querySelector<HTMLElement>("#gateway-ui")!;
createAuthWidget(ui, client);
createPollingWidget(ui, client);
const status = document.querySelector<HTMLElement>("#status")!;
const alert = document.querySelector<HTMLElement>("#alert")!;
const local = document.querySelector<HTMLButtonElement>("#local")!;
const preview = document.querySelector<HTMLButtonElement>("#preview")!;
const reset = document.querySelector<HTMLButtonElement>("#reset")!;
const poll = document.querySelector<HTMLButtonElement>("#poll")!;
let health = 50;
let alertTimer: ReturnType<typeof setTimeout>;
let catalogOwner: string | undefined;

function draw() {
  document.querySelector<HTMLOutputElement>("#health")!.value = String(health);
  document.querySelector<HTMLMeterElement>("#meter")!.value = health;
}

function showAlert(viewer: string) {
  clearTimeout(alertTimer);
  alert.textContent = `${viewer} selected Spawn Healthpack`;
  alertTimer = setTimeout(() => { alert.textContent = ""; }, 6000);
}

function heal() {
  health = Math.min(100, health + 10);
  draw();
}

const publishHealth = () => client.setGameTexts([{ label: "Health", value: String(health), icon: "fa-solid:heart" }]);
local.onclick = heal;
reset.onclick = () => { health = 50; draw(); alert.textContent = ""; };
preview.onclick = () => showAlert("Preview viewer");
local.disabled = preview.disabled = reset.disabled = false;
status.textContent = "Local demo ready.";
client.on("disconnect", () => { local.disabled = reset.disabled = false; poll.disabled = true; });

client.on("authentication", async ({ hasError, twitchUsername }) => {
  if (hasError) return;
  local.disabled = reset.disabled = true;
  try {
    await client.setGameMetadata({ name: "Hypeline Healthpack" });
    await publishHealth();
    if (catalogOwner !== twitchUsername) {
      await client.setGameActions([{
        id: "healthpack", name: "Spawn Healthpack", description: "Restore up to 10 health",
        icon: "fa-solid:heart", category: GameActionCategory.Help,
        state: GameActionState.Available, impact: 1, count: 3,
        onGameActionUsed: async (used) => {
          showAlert(used.username);
          if (health === 100) {
            status.textContent = "Health is full. Requesting a refund…";
            try {
              await client.refundGameAction(used, "Health is full");
              status.textContent = "Refund acknowledged.";
            } catch { status.textContent = "Refund unconfirmed. Check the transaction before retrying."; }
            return;
          }
          heal();
          status.textContent = "Health restored. Waiting for acknowledgment…";
          try {
            await client.acceptGameAction(used, "Restored health");
          } catch {
            status.textContent = "Health restored. Acknowledgment unconfirmed.";
            return;
          }
          try {
            await publishHealth();
            status.textContent = "Action acknowledged. Health published.";
          } catch { status.textContent = "Action acknowledged. Health update unconfirmed."; }
        }
      }]);
      catalogOwner = twitchUsername;
    }
    await client.subscribeToTransactions();
    poll.disabled = false;
    status.textContent = "Ready for viewer actions.";
  } catch { status.textContent = "Could not publish game setup. Check the connection."; }
});

poll.onclick = () => {
  void client.startPoll({ prompt: "Which room next?", options: ["Garden", "Library"],
    mode: PollMode.Order, durationInSeconds: 30
  }).catch(() => { status.textContent = "Could not start poll."; });
};
