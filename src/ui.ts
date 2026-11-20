import type { HypecadeClient } from "./client";
import type { GameActionUsed, PollUpdate } from "./types";

type Destroyable = { destroy(): void };

export interface AuthWidgetOptions {
  title?: string;
  extensionUrl?: string;
  className?: string;
}

export interface NotificationHistoryOptions {
  className?: string;
  clearTimeMs?: number;
  maxEntries?: number;
  autoAddActionMessages?: boolean;
  messageTemplate?: string;
}

export interface PollingWidgetOptions {
  className?: string;
  winnerPauseMs?: number;
}

export function createAuthWidget(
  container: HTMLElement,
  client: HypecadeClient,
  options: AuthWidgetOptions = {}
): Destroyable {
  const root = document.createElement("section");
  root.className = options.className ?? "muxy-gateway-auth";
  root.innerHTML = `
    <form>
      <strong>${escapeHtml(options.title ?? "Hypecade")}</strong>
      <input name="pin" autocomplete="one-time-code" maxlength="6" placeholder="PIN" />
      <button type="submit">Authenticate</button>
      <button type="button" data-role="disconnect">Disconnect</button>
      <a href="${escapeAttribute(options.extensionUrl ?? "https://dashboard.twitch.tv/extensions/i575hs2x9lb3u8hqujtezit03w1740")}" target="_blank" rel="noreferrer">Get extension</a>
      <p data-role="status"></p>
    </form>
  `;

  injectBaseStyles();
  container.append(root);

  const form = root.querySelector("form") as HTMLFormElement;
  const input = root.querySelector("input") as HTMLInputElement;
  const status = root.querySelector('[data-role="status"]') as HTMLElement;
  const disconnect = root.querySelector('[data-role="disconnect"]') as HTMLButtonElement;

  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    status.textContent = "Authenticating...";
    const pin = input.value;
    input.value = "";
    void client.authenticateWithPin(pin).then((response) => {
      status.textContent = response.hasError ? "Authentication failed" : "Authenticated";
    }).catch(() => { status.textContent = "Connection failed. Check your code and try again."; });
  };

  const onDisconnect = () => {
    void client.deauthenticate().then(() => {
      status.textContent = "Disconnected";
    });
  };

  const offAuth = client.on("authentication", (response) => {
    status.textContent = response.hasError ? "Authentication failed" : "Authenticated";
  });

  form.addEventListener("submit", onSubmit);
  disconnect.addEventListener("click", onDisconnect);

  return {
    destroy() {
      offAuth();
      form.removeEventListener("submit", onSubmit);
      disconnect.removeEventListener("click", onDisconnect);
      root.remove();
    }
  };
}

export function createNotificationHistory(
  container: HTMLElement,
  client: HypecadeClient,
  options: NotificationHistoryOptions = {}
): Destroyable {
  const root = document.createElement("ol");
  root.className = options.className ?? "muxy-gateway-notifications";
  container.append(root);
  injectBaseStyles();

  const clearTimeMs = options.clearTimeMs ?? 8000;
  const maxEntries = options.maxEntries ?? 4;
  const auto = options.autoAddActionMessages ?? true;
  const template = options.messageTemplate ?? "{Username} just bought {ActionID}";
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  const add = (message: string) => {
    const item = document.createElement("li");
    item.textContent = message;
    root.prepend(item);

    while (root.children.length > maxEntries) {
      root.lastElementChild?.remove();
    }

    if (clearTimer) {
      clearTimeout(clearTimer);
    }

    clearTimer = setTimeout(() => {
      root.replaceChildren();
    }, clearTimeMs);
  };

  const off = client.onActionUsed((used) => {
    if (!auto) {
      return;
    }
    add(formatActionMessage(template, used));
  });

  return {
    destroy() {
      off();
      if (clearTimer) {
        clearTimeout(clearTimer);
      }
      root.remove();
    }
  };
}

export function createPollingWidget(
  container: HTMLElement,
  client: HypecadeClient,
  options: PollingWidgetOptions = {}
): Destroyable {
  const root = document.createElement("section");
  root.className = options.className ?? "muxy-gateway-poll";
  root.hidden = true;
  container.append(root);
  injectBaseStyles();

  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const render = (update: PollUpdate) => {
    const total = update.count || 1;
    root.hidden = false;
    root.replaceChildren();

    const list = document.createElement("ol");
    update.results.forEach((votes, index) => {
      const item = document.createElement("li");
      item.className = update.isFinal && update.winner === index ? "is-winner" : "";
      const percent = Math.round((votes / total) * 100);
      item.innerHTML = `<span>Option ${index + 1}</span><meter min="0" max="100" value="${percent}"></meter><strong>${votes}</strong>`;
      list.append(item);
    });

    root.append(list);

    if (update.isFinal) {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      hideTimer = setTimeout(() => {
        root.hidden = true;
      }, options.winnerPauseMs ?? 3000);
    }
  };

  const off = client.onPollUpdate(render);

  return {
    destroy() {
      off();
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
      root.remove();
    }
  };
}

function formatActionMessage(template: string, used: GameActionUsed): string {
  const values: Record<string, string> = {
    TransactionID: used.transactionId,
    ActionID: used.actionId,
    Cost: String(used.cost),
    UserID: used.userId,
    Username: used.username
  };

  return template.replace(/\{(.+?)\}/g, (_, key: string) => values[key] ?? "");
}

let stylesInjected = false;

function injectBaseStyles(): void {
  if (stylesInjected || typeof document === "undefined") {
    return;
  }

  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .muxy-gateway-auth, .muxy-gateway-notifications, .muxy-gateway-poll {
      font-family: system-ui, sans-serif;
      color: #f8fafc;
    }
    .muxy-gateway-auth form {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    .muxy-gateway-auth input, .muxy-gateway-auth button {
      font: inherit;
      min-height: 32px;
    }
    .muxy-gateway-notifications {
      list-style: none;
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
    }
    .muxy-gateway-notifications li, .muxy-gateway-poll {
      background: rgb(15 23 42 / 0.88);
      border: 1px solid rgb(148 163 184 / 0.32);
      border-radius: 6px;
      padding: 8px 10px;
    }
    .muxy-gateway-poll ol {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .muxy-gateway-poll li {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) 2fr auto;
      gap: 8px;
      align-items: center;
    }
    .muxy-gateway-poll .is-winner {
      color: #93c5fd;
    }
  `;
  document.head.append(style);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const escapes: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return escapes[char] ?? char;
  });
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
