import {
  GameActionCategory,
  GameActionState,
  GatewayClient,
  InfiniteCount,
  type GameAction,
  type GameActionUsed,
  type GatewayEnvelope,
  type GatewayError
} from "../../src";

const GAME_ID = "gamelink-testing";
const GAME_NAME = "Professor Toast's Sideways Panic";
const REFRESH_KEY = `muxy.gateway.${GAME_ID}.refreshToken`;

type AbilityId = "scooter_swarm" | "speed_boost" | "health_drop" | "bomb_drop" | "toastquake";
type RunMode = "muxy" | "demo";

type AbilityConfig = {
  id: AbilityId;
  label: string;
  description: string;
  icon: string;
  category: GameActionCategory;
  impact: number;
  feedText: (viewer: string) => string;
};

type Obstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  color: string;
  label: string;
  damage: number;
};

type Pickup = {
  x: number;
  y: number;
  radius: number;
  kind: "health" | "bomb";
};

type ToastParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  label: string;
};

const abilities: AbilityConfig[] = [
  {
    id: "scooter_swarm",
    label: "Scooter Swarm",
    description: "Send five tiny scooters to rattle the breakfast courier.",
    icon: "fa-solid:motorcycle",
    category: GameActionCategory.Hinder,
    impact: 2,
    feedText: (viewer) => `${viewer} unleashed Scooter Swarm`
  },
  {
    id: "speed_boost",
    label: "Speed Boost",
    description: "Give the runner a fast-forward burst for ten seconds.",
    icon: "fa-solid:bolt",
    category: GameActionCategory.Help,
    impact: 2,
    feedText: (viewer) => `${viewer} fired up Speed Boost`
  },
  {
    id: "health_drop",
    label: "Health Drop",
    description: "Drop a glowing snack that restores health.",
    icon: "fa-solid:heart",
    category: GameActionCategory.Help,
    impact: 1,
    feedText: (viewer) => `${viewer} sent a Health Drop`
  },
  {
    id: "bomb_drop",
    label: "Bomb Drop",
    description: "Place a screen-clearing toaster bomb in the lane.",
    icon: "fa-solid:bomb",
    category: GameActionCategory.Help,
    impact: 5,
    feedText: (viewer) => `${viewer} dropped a Bomb`
  },
  {
    id: "toastquake",
    label: "Toastquake",
    description: "Shake the road and launch a wall of burnt toast.",
    icon: "fa-solid:fire",
    category: GameActionCategory.Hinder,
    impact: 4,
    feedText: (viewer) => `${viewer} triggered Toastquake`
  }
];

const canvas = document.querySelector("#game-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
const menu = document.querySelector("#menu") as HTMLElement;
const gameScreen = document.querySelector("#game-screen") as HTMLElement;
const linkForm = document.querySelector("#link-form") as HTMLFormElement;
const pinInput = document.querySelector("#pin-input") as HTMLInputElement;
const unlinkButton = document.querySelector("#unlink-button") as HTMLButtonElement;
const muxyStartButton = document.querySelector("#muxy-start-button") as HTMLButtonElement;
const demoButton = document.querySelector("#demo-button") as HTMLButtonElement;
const menuButton = document.querySelector("#menu-button") as HTMLButtonElement;
const linkStatus = document.querySelector("#link-status") as HTMLElement;
const gatewayStatus = document.querySelector("#gateway-status") as HTMLElement;
const gatewayDot = document.querySelector("#gateway-dot") as HTMLElement;
const gatewayDebugLog = document.querySelector("#gateway-debug-log") as HTMLOListElement;
const eventFeed = document.querySelector("#event-feed") as HTMLOListElement;
const simulatorActions = document.querySelector("#simulator-actions") as HTMLElement;
const modeReadout = document.querySelector("#mode-readout") as HTMLElement;
const healthReadout = document.querySelector("#health-readout") as HTMLElement;
const distanceReadout = document.querySelector("#distance-readout") as HTMLElement;
const heatReadout = document.querySelector("#heat-readout") as HTMLElement;

const gateway = new GatewayClient({
  gameId: GAME_ID,
  stage: "production",
  autoConnect: true,
  endpoint: () => `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/muxy-gateway`,
  storageKey: REFRESH_KEY
});

function gatewayTrace(label: string, details?: unknown): void {
  console.info(`[Muxy Gateway] ${label}`, details ?? "");
  const item = document.createElement("li");
  const payload = typeof details === "undefined" || details === "" ? "" : ` ${JSON.stringify(details)}`;
  item.textContent = `${new Date().toLocaleTimeString()} ${label}${payload}`;
  gatewayDebugLog.prepend(item);

  while (gatewayDebugLog.children.length > 8) {
    gatewayDebugLog.lastElementChild?.remove();
  }
}

function summarizeEnvelope(envelope: GatewayEnvelope): Record<string, unknown> {
  const data = envelope.data && typeof envelope.data === "object" ? (envelope.data as Record<string, unknown>) : undefined;

  return {
    action: envelope.action ?? envelope.meta?.action,
    target: envelope.params?.target ?? envelope.meta?.target,
    requestId: envelope.params?.request_id ?? envelope.meta?.request_id,
    dataKeys: data ? Object.keys(data).filter((key) => !["pin", "jwt", "refresh", "refreshToken"].includes(key)) : [],
    errors: envelope.errors?.map(summarizeGatewayError)
  };
}

function summarizeGatewayError(error: GatewayError): Record<string, unknown> {
  return {
    status: error.status,
    title: error.title,
    detail: error.detail
  };
}

let linked = false;
let gatewayReady = false;
let running = false;
let runMode: RunMode = "muxy";
let health = 100;
let distance = 0;
let heat = 1;
let speedBoostSeconds = 0;
let shakeSeconds = 0;
let damageCooldownSeconds = 0;
let spawnTimer = 0;
let gameTextTimer = 0;
let lastTime = performance.now();

const player = {
  x: 150,
  y: 370,
  width: 56,
  height: 66,
  vy: 0,
  grounded: true
};

const obstacles: Obstacle[] = [];
const pickups: Pickup[] = [];
const particles: ToastParticle[] = [];

gateway.on("connect", () => {
  gatewayTrace("connected");
  gatewayReady = true;
  setGatewayStatus();
  trySavedRefreshToken();
});

gateway.on("disconnect", (event) => {
  gatewayTrace("disconnected", "code" in event ? { code: event.code, reason: event.reason } : {});
  gatewayReady = false;
  setGatewayStatus("Gateway disconnected. It will retry automatically.");
});

gateway.on("authentication", (response) => {
  gatewayTrace("authentication", {
    hasError: response.hasError,
    twitchUsername: response.twitchUsername,
    errors: response.errors?.map(summarizeGatewayError)
  });
  linked = !response.hasError;
  const errorDetail = response.errors?.[0]?.detail;
  setGatewayStatus(
    response.hasError
      ? `Link failed${errorDetail ? `: ${errorDetail}` : ". Check the code and try again."}`
      : `Linked as ${response.twitchUsername || "Twitch"}.`
  );

  if (linked) {
    registerGatewayState();
  }
});

gateway.onActionUsed((used) => {
  applyViewerAbility(used.actionId as AbilityId, used.username || "A viewer", used);
});

gateway.on("request", (envelope) => {
  gatewayTrace("request", summarizeEnvelope(envelope));
});

gateway.on("message", (envelope) => {
  gatewayTrace("message", summarizeEnvelope(envelope));
});

gateway.on("error", (error) => {
  gatewayTrace("error", Array.isArray(error) ? error.map(summarizeGatewayError) : {});
});

linkForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pin = pinInput.value.trim().toUpperCase();
  if (!pin) {
    setGatewayStatus("Enter the Muxy link code from the Twitch extension.");
    return;
  }

  setGatewayStatus("Linking with Muxy...");
  void gateway.authenticateWithPin(pin).catch(() => {
    linked = false;
    setGatewayStatus("Link failed. Check that the code is fresh and Gateway is connected.");
  });
});

unlinkButton.addEventListener("click", async () => {
  setGatewayStatus("Clearing Twitch extension state...");
  running = false;

  await gateway.clearGameState().catch((error) => {
    gatewayTrace("clear failed", error instanceof Error ? { message: error.message } : {});
  });

  linked = false;
  await gateway.deauthenticate();
  setGatewayStatus("Not linked. Saved token cleared.");
});

muxyStartButton.addEventListener("click", () => startRun("muxy"));
demoButton.addEventListener("click", () => startRun("demo"));

menuButton.addEventListener("click", () => {
  running = false;
  gameScreen.classList.add("is-hidden");
  menu.classList.remove("is-hidden");
});

window.addEventListener("keydown", (event) => {
  if ((event.code === "Space" || event.code === "ArrowUp") && running && player.grounded) {
    player.vy = -780;
    player.grounded = false;
  }
});

function makeGatewayActions(): GameAction[] {
  return abilities.map((ability) => ({
    id: ability.id,
    name: ability.label,
    description: ability.description,
    icon: ability.icon,
    category: ability.category,
    state: running ? GameActionState.Available : GameActionState.Hidden,
    impact: ability.impact,
    count: InfiniteCount
  }));
}

function startRun(mode: RunMode): void {
  runMode = mode;
  menu.classList.add("is-hidden");
  gameScreen.classList.remove("is-hidden");
  gameScreen.classList.toggle("is-muxy-mode", mode === "muxy");
  gameScreen.classList.toggle("is-demo-mode", mode === "demo");
  resetRun();
  registerGatewayState();
}

function registerGatewayState(): void {
  void gateway.setGameMetadata({
    name: GAME_NAME,
    theme: "default"
  }).catch(() => undefined);

  void gateway.setGameActions(makeGatewayActions()).catch(() => undefined);
  sendGameTexts();
}

function sendGameTexts(): void {
  void gateway.setGameTexts([
    { label: "Run State", value: running ? (runMode === "muxy" ? "Muxy Run" : "Demo Run") : "Menu", icon: "fa-solid:person-running" },
    { label: "Distance", value: `${Math.floor(distance)}m`, icon: "fa-solid:road" },
    { label: "Health", value: `${Math.max(0, Math.floor(health))}`, icon: "fa-solid:heart" }
  ]).catch(() => undefined);
}

function trySavedRefreshToken(): void {
  if (!gateway.refreshToken || linked) {
    return;
  }

  setGatewayStatus("Saved token found. Trying auto-link...");
  void gateway.authenticateWithRefreshToken().catch(() => {
    linked = false;
    setGatewayStatus("Saved link expired. Enter a fresh Muxy code.");
  });
}

function setGatewayStatus(message?: string): void {
  linkStatus.textContent = linked ? "Linked" : "Not linked";
  gatewayStatus.textContent = message ?? (gatewayReady ? "Gateway websocket is ready." : "Gateway websocket is connecting.");
  gatewayDot.classList.toggle("is-ready", linked);
}

function resetRun(): void {
  running = true;
  health = 100;
  distance = 0;
  heat = 1;
  speedBoostSeconds = 0;
  shakeSeconds = 0;
  damageCooldownSeconds = 0;
  spawnTimer = 0.8;
  obstacles.length = 0;
  pickups.length = 0;
  particles.length = 0;
  player.y = 370;
  player.vy = 0;
  player.grounded = true;
  updateHud();
  eventFeed.replaceChildren();
  addFeed(runMode === "muxy" ? "Muxy run started. Waiting for Twitch viewers." : "Demo run started. Local simulator is active.");
}

function applyViewerAbility(actionId: AbilityId, username: string, used?: GameActionUsed): void {
  const ability = abilities.find((item) => item.id === actionId);
  if (!ability) {
    return;
  }

  addFeed(`${ability.feedText(username)}.`);
  spawnText(username, ability.label);

  if (actionId === "scooter_swarm") {
    for (let i = 0; i < 5; i += 1) {
      obstacles.push(makeObstacle(960 + i * 92, 394, "#38bdf8", "SCOOT", 7, 360 + i * 18));
    }
  }

  if (actionId === "speed_boost") {
    speedBoostSeconds = 10;
  }

  if (actionId === "health_drop") {
    pickups.push({ x: 960, y: 374, radius: 18, kind: "health" });
  }

  if (actionId === "bomb_drop") {
    pickups.push({ x: 900, y: 374, radius: 20, kind: "bomb" });
  }

  if (actionId === "toastquake") {
    shakeSeconds = 3;
    for (let i = 0; i < 8; i += 1) {
      obstacles.push(makeObstacle(960 + i * 72, 390 - (i % 2) * 38, "#f97316", "TOAST", 5, 300));
    }
  }

  if (used) {
    void gateway.acceptGameAction(used, `${username} used ${ability.label}`).catch(() => undefined);
  }
}

function makeObstacle(
  x: number,
  y: number,
  color: string,
  label: string,
  damage: number,
  speed = 260
): Obstacle {
  return { x, y, width: 58, height: 48, speed, color, label, damage };
}

function spawnText(username: string, ability: string): void {
  particles.push({
    x: player.x + 20 + (particles.length % 3) * 34,
    y: player.y - 28 - (particles.length % 5) * 18,
    vx: 12,
    vy: -36,
    life: 2.1,
    label: `${username}: ${ability}`
  });

  while (particles.length > 8) {
    particles.shift();
  }
}

function addFeed(message: string): void {
  const item = document.createElement("li");
  item.textContent = message;
  eventFeed.prepend(item);
  while (eventFeed.children.length > 6) {
    eventFeed.lastElementChild?.remove();
  }
}

function updateGame(deltaSeconds: number): void {
  if (!running) {
    return;
  }

  const speedFactor = speedBoostSeconds > 0 ? 1.55 : 1;
  heat = speedBoostSeconds > 0 ? 2 : 1;
  distance += 18 * speedFactor * deltaSeconds;
  spawnTimer -= deltaSeconds;
  gameTextTimer -= deltaSeconds;
  speedBoostSeconds = Math.max(0, speedBoostSeconds - deltaSeconds);
  shakeSeconds = Math.max(0, shakeSeconds - deltaSeconds);
  damageCooldownSeconds = Math.max(0, damageCooldownSeconds - deltaSeconds);

  if (spawnTimer <= 0) {
    spawnTimer = Math.max(0.6, 1.35 - distance / 1000);
    obstacles.push(makeObstacle(990, 394, "#64748b", "BILL", 8, 250 + distance * 0.04));
  }

  player.vy += 1750 * deltaSeconds;
  player.y += player.vy * deltaSeconds;
  if (player.y >= 370) {
    player.y = 370;
    player.vy = 0;
    player.grounded = true;
  }

  for (const obstacle of obstacles) {
    obstacle.x -= obstacle.speed * speedFactor * deltaSeconds;
    if (
      damageCooldownSeconds <= 0 &&
      intersects(player.x, player.y, player.width, player.height, obstacle.x, obstacle.y, obstacle.width, obstacle.height)
    ) {
      health -= obstacle.damage;
      damageCooldownSeconds = 0.32;
      obstacle.x = -999;
      spawnText("Impact", `-${obstacle.damage} health`);
    }
  }

  for (const pickup of pickups) {
    pickup.x -= 230 * speedFactor * deltaSeconds;
    if (circleIntersectsPlayer(pickup)) {
      if (pickup.kind === "health") {
        health = Math.min(100, health + 24);
        spawnText("Pickup", "+24 health");
      } else {
        obstacles.length = 0;
        spawnText("Pickup", "screen cleared");
      }
      pickup.x = -999;
    }
  }

  for (const particle of particles) {
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.life -= deltaSeconds;
  }

  removeDeadEntries();

  if (gameTextTimer <= 0) {
    gameTextTimer = 1;
    sendGameTexts();
  }

  if (health <= 0) {
    running = false;
    addFeed(`Run ended at ${Math.floor(distance)}m. Start again from the menu.`);
    registerGatewayState();
  }
}

function removeDeadEntries(): void {
  for (let i = obstacles.length - 1; i >= 0; i -= 1) {
    const obstacle = obstacles[i];
    if (obstacle && obstacle.x < -120) {
      obstacles.splice(i, 1);
    }
  }

  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    if (pickup && pickup.x < -60) {
      pickups.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    if (particle && particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawGame(): void {
  const shake = shakeSeconds > 0 ? Math.sin(performance.now() / 28) * 7 : 0;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(shake, 0);

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#172554");
  sky.addColorStop(0.55, "#0f766e");
  sky.addColorStop(1, "#111827");
  ctx.fillStyle = sky;
  ctx.fillRect(-20, 0, canvas.width + 40, canvas.height);

  drawBackground();
  drawRoad();
  drawPlayer();
  obstacles.forEach(drawObstacle);
  pickups.forEach(drawPickup);
  particles.forEach(drawParticle);

  ctx.restore();
  updateHud();
}

function drawBackground(): void {
  ctx.fillStyle = "rgb(248 250 252 / 0.18)";
  for (let i = 0; i < 8; i += 1) {
    const x = (i * 170 - (distance * 5) % 170) - 40;
    ctx.fillRect(x, 130 + (i % 3) * 28, 78, 14);
  }

  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(820, 90, 42, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoad(): void {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 430, canvas.width, 110);
  ctx.fillStyle = "#334155";
  ctx.fillRect(0, 428, canvas.width, 6);

  ctx.fillStyle = "#f8fafc";
  for (let i = 0; i < 12; i += 1) {
    const x = i * 110 - (distance * 24) % 110;
    ctx.fillRect(x, 482, 54, 6);
  }
}

function drawPlayer(): void {
  ctx.fillStyle = speedBoostSeconds > 0 ? "#fbbf24" : "#f97316";
  roundedRect(player.x, player.y, player.width, player.height, 8);
  ctx.fill();

  ctx.fillStyle = "#111827";
  ctx.fillRect(player.x + 14, player.y + 14, 10, 10);
  ctx.fillRect(player.x + 34, player.y + 14, 10, 10);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(player.x + 12, player.y + 48, 34, 6);
}

function drawObstacle(obstacle: Obstacle): void {
  ctx.fillStyle = obstacle.color;
  roundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 6);
  ctx.fill();
  ctx.fillStyle = "#020617";
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(obstacle.label, obstacle.x + obstacle.width / 2, obstacle.y + 29);
}

function drawPickup(pickup: Pickup): void {
  ctx.fillStyle = pickup.kind === "health" ? "#22c55e" : "#eab308";
  ctx.beginPath();
  ctx.arc(pickup.x, pickup.y, pickup.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#052e16";
  ctx.font = "bold 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(pickup.kind === "health" ? "+" : "!", pickup.x, pickup.y + 6);
}

function drawParticle(particle: ToastParticle): void {
  ctx.globalAlpha = Math.max(0, Math.min(1, particle.life / 2));
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 18px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(particle.label, particle.x, particle.y);
  ctx.globalAlpha = 1;
}

function roundedRect(x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function updateHud(): void {
  modeReadout.textContent = runMode === "muxy" ? "Muxy" : "Demo";
  healthReadout.textContent = `${Math.max(0, Math.floor(health))}`;
  distanceReadout.textContent = `${Math.floor(distance)}m`;
  heatReadout.textContent = `${heat}x`;
}

function intersects(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleIntersectsPlayer(pickup: Pickup): boolean {
  const closestX = Math.max(player.x, Math.min(pickup.x, player.x + player.width));
  const closestY = Math.max(player.y, Math.min(pickup.y, player.y + player.height));
  const dx = pickup.x - closestX;
  const dy = pickup.y - closestY;
  return dx * dx + dy * dy < pickup.radius * pickup.radius;
}

function gameLoop(now: number): void {
  const deltaSeconds = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  updateGame(deltaSeconds);
  drawGame();
  requestAnimationFrame(gameLoop);
}

function renderSimulatorButtons(): void {
  simulatorActions.replaceChildren();
  abilities.forEach((ability, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${ability.label} as Viewer${index + 1}`;
    button.addEventListener("click", () => {
      applyViewerAbility(ability.id, `Viewer${index + 1}`);
    });
    simulatorActions.append(button);
  });
}

renderSimulatorButtons();
setGatewayStatus();
drawGame();
requestAnimationFrame(gameLoop);
