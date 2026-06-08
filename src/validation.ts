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

export function normalizeMetadata(metadata: GameMetadata): Required<GameMetadata> {
  return {
    name: String(metadata.name ?? ""),
    logo: String(metadata.logo ?? ""),
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
  if (!action.id) {
    throw new Error("Gateway action requires an id");
  }

  const impact = Math.trunc(action.impact);
  if (impact < 1 || impact > 5) {
    throw new Error(`Gateway action "${action.id}" impact must be between 1 and 5`);
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
  const normalized = Math.trunc(count);

  if (normalized < 0 || normalized > InfiniteCount) {
    throw new Error(`Gateway action count must be between 0 and ${InfiniteCount}`);
  }

  return normalized;
}

export function normalizePoll(config: PollConfiguration): Required<PollConfiguration> {
  if (!config.prompt) {
    throw new Error("Poll prompt is required");
  }

  if (!Array.isArray(config.options) || config.options.length < 2) {
    throw new Error("Polls require at least two options");
  }

  if (config.options.length > 64) {
    throw new Error("Polls support at most 64 options");
  }

  const duration = Math.trunc(config.durationInSeconds ?? 0);
  if (duration < 0) {
    throw new Error("Poll duration cannot be negative");
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
