import {
  GameActionCategory,
  GameActionState,
  InfiniteCount,
  PollMode,
  type GameAction,
  type GameMetadata,
  type GameText,
  type PollConfiguration
} from "./types";

const encoder = new TextEncoder();

function limitBytes(value: string, limit: number, label: string): void {
  if (value.length > limit || encoder.encode(value).byteLength > limit) {
    throw new Error(`${label} exceeds ${limit} UTF-8 bytes`);
  }
}

export function normalizeGameId(raw: string): string {
  const id = raw?.trim().toLowerCase();
  if (!id || id.length < 3 || id.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Game ID must be 3–64 lowercase letters or digits separated by single hyphens");
  }
  return id;
}

export function normalizeMetadata(metadata: GameMetadata): Required<GameMetadata> {
  const name = String(metadata.name ?? "");
  const logo = String(metadata.logo ?? "");
  limitBytes(name, 256, "Game name");
  limitBytes(logo, 1024 * 1024, "Game logo");
  return {
    name,
    logo,
    theme: String(metadata.theme ?? "")
  };
}

export function normalizeTexts(texts: GameText[]): Required<GameText>[] {
  return texts.map((text) => ({
    label: String(text.label ?? ""),
    value: String(text.value ?? ""),
    icon: String(text.icon ?? "")
  }));
}

export function normalizeAction(action: GameAction): Required<Omit<GameAction, "onGameActionUsed">> {
  if (!action.id?.trim() || action.id.length > 64) {
    throw new Error("Action ID must be nonempty and at most 64 characters");
  }

  const impact = action.impact;
  if (!Number.isInteger(impact) || impact < 0 || impact > 5) {
    throw new Error(`Gateway action "${action.id}" impact must be an integer from 0 to 5`);
  }

  if (action.category !== undefined && ![0, 1, 2].includes(action.category) ||
      action.state !== undefined && ![0, 1, 2].includes(action.state)) {
    throw new Error("Invalid action category or state");
  }
  return {
    id: action.id,
    category: action.category ?? GameActionCategory.Neutral,
    state: action.state ?? GameActionState.Unavailable,
    impact,
    name: String(action.name ?? ""),
    description: String(action.description ?? ""),
    icon: String(action.icon ?? ""),
    count: normalizeCount(action.count)
  };
}

export function normalizeCount(count = InfiniteCount): number {
  if (!Number.isFinite(count)) {
    throw new Error("Gateway action count must be a finite number");
  }
  if (!Number.isInteger(count) || count < 0 || count > InfiniteCount) {
    throw new Error(`Gateway action count must be between 0 and ${InfiniteCount}`);
  }

  return count;
}

export function normalizePoll(config: PollConfiguration): Required<PollConfiguration> {
  if (!config.prompt) {
    throw new Error("Poll prompt is required");
  }

  if (!Array.isArray(config.options) || config.options.length < 2) {
    throw new Error("Polls require at least two options");
  }

  if (config.options.length > 10) {
    throw new Error("Polls support at most 10 options");
  }

  limitBytes(config.prompt, 256, "Poll prompt");
  for (const option of config.options) limitBytes(String(option), 128, "Poll option");

  const rawDuration = config.durationInSeconds ?? 0;
  if (!Number.isFinite(rawDuration)) {
    throw new Error("Poll duration must be a finite number");
  }
  const duration = Math.trunc(rawDuration);
  if (rawDuration < 0 || duration > 2_147_483) {
    throw new Error("Poll duration must be between 0 and 2147483 seconds");
  }

  return {
    id: config.id ?? `gateway-poll-${Date.now().toString(36)}`,
    prompt: config.prompt,
    location: config.location ?? 0,
    mode: config.mode ?? PollMode.Order,
    options: config.options.map(String),
    durationInSeconds: duration,
    onPollUpdate: config.onPollUpdate ?? (() => undefined)
  };
}
