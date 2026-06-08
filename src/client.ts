import { TypedEmitter } from "./events";
import { toPollUpdate } from "./poll";
import { actionOf, createRequest, isOk, requestIdOf, resolveEndpoint, targetOf, RequestIds } from "./protocol";
import { defaultStorage } from "./storage";
import { BrowserTransport } from "./transport";
import {
  GameActionCategory,
  GameActionState,
  GATEWAY_EXTENSION_CLIENT_ID,
  type AuthenticationResponse,
  type BitsUsed,
  type GameAction,
  type GameActionUsed,
  type GameMetadata,
  type GameText,
  type GatewayClientOptions,
  type GatewayEnvelope,
  type GatewayEventMap,
  type GatewayEventName,
  type GatewayListener,
  type PollConfiguration,
  type PollUpdate,
  type Stage,
  type StorageAdapter
} from "./types";
import {
  normalizeAction,
  normalizeCount,
  normalizeMetadata,
  normalizePoll,
  normalizeTexts
} from "./validation";

type PendingRequest = {
  resolve: (value: GatewayEnvelope) => void;
  reject: (reason: unknown) => void;
};

interface GatewayState {
  metadata?: ReturnType<typeof normalizeMetadata>;
  texts?: ReturnType<typeof normalizeTexts>;
  actions?: ReturnType<typeof normalizeAction>[];
}

type GatewayActionPayload = {
  id: string;
  category: "neutral" | "hinder" | "help";
  state: "unavailable" | "available" | "hidden";
  impact: number;
  name: string;
  description: string;
  icon: string;
  count: number;
};

export class GatewayClient {
  private readonly emitter = new TypedEmitter();
  private readonly requestIds = new RequestIds();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly storage: StorageAdapter;
  private readonly storageKey: string;
  private readonly logger: Pick<Console, "debug" | "info" | "warn" | "error">;
  private readonly actionCallbacks = new Map<string, (used: GameActionUsed) => void>();
  private readonly state: GatewayState;
  private transport: BrowserTransport | null = null;
  private stage: Stage;
  private currentPoll: Required<PollConfiguration> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private authenticated = false;
  private jwt = "";

  constructor(private readonly options: GatewayClientOptions) {
    if (!options.gameId) {
      throw new Error("GatewayClient requires a gameId");
    }

    this.stage = options.stage ?? "production";
    this.storage = options.storage ?? defaultStorage();
    this.storageKey = options.storageKey ?? `muxy.gateway.${options.gameId}.refreshToken`;
    this.logger = options.logger ?? console;
    this.state = {};

    if (options.autoConnect) {
      this.connect();
    }
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  get refreshToken(): string {
    return this.storage.getItem(this.storageKey) ?? "";
  }

  on<Name extends GatewayEventName>(
    event: Name,
    listener: GatewayListener<GatewayEventMap[Name]>
  ): () => void {
    return this.emitter.on(event, listener);
  }

  off<Name extends GatewayEventName>(
    event: Name,
    listener: GatewayListener<GatewayEventMap[Name]>
  ): void {
    this.emitter.off(event, listener);
  }

  onActionUsed(listener: (used: GameActionUsed) => void): () => void {
    return this.on("actionUsed", listener);
  }

  onBitsUsed(listener: (used: BitsUsed) => void): () => void {
    return this.on("bitsUsed", listener);
  }

  onPollUpdate(listener: (update: PollUpdate) => void): () => void {
    return this.on("pollUpdate", listener);
  }

  onDebug(listener: (message: unknown) => void): () => void {
    return this.on("debug", listener);
  }

  connect(): void {
    const endpoint = resolveEndpoint(this.stage, (stage) => {
      if (typeof this.options.endpoint === "function") {
        return this.options.endpoint(stage, this.options);
      }
      return resolveEndpoint(stage, this.options.endpoint);
    });

    this.transport = new BrowserTransport({
      url: endpoint,
      websocket: this.options.websocket,
      reconnect: this.options.reconnect,
      onOpen: (event) => this.emitter.emit("connect", event),
      onClose: (event) => this.emitter.emit("disconnect", event),
      onError: (event) => this.emitter.emit("error", event),
      onMessage: (message) => this.receive(message)
    });
    this.transport.connect();
  }

  disconnect(): void {
    this.transport?.disconnect();
    this.transport = null;
  }

  runInSandbox(): void {
    this.stage = "sandbox";
    this.disconnect();
    this.connect();
  }

  runInProduction(): void {
    this.stage = "production";
    this.disconnect();
    this.connect();
  }

  async authenticateWithPin(pin: string): Promise<AuthenticationResponse> {
    const response = await this.request("authenticate", undefined, {
      pin,
      client_id: GATEWAY_EXTENSION_CLIENT_ID,
      game_id: this.options.gameId
    });
    return this.handleAuthenticationResponse(response);
  }

  async authenticateWithRefreshToken(refresh = this.refreshToken): Promise<AuthenticationResponse> {
    const response = await this.request("authenticate", undefined, {
      refresh,
      client_id: GATEWAY_EXTENSION_CLIENT_ID,
      game_id: this.options.gameId
    });
    return this.handleAuthenticationResponse(response);
  }

  async deauthenticate(): Promise<void> {
    this.storage.removeItem(this.storageKey);
    this.authenticated = false;
    this.jwt = "";
    this.sendFireAndForget("deauthenticate");
    this.disconnect();
  }

  async clearGameState(): Promise<GatewayEnvelope> {
    this.actionCallbacks.clear();
    this.state.metadata = normalizeMetadata({ name: "", logo: "", theme: "" });
    this.state.actions = [];
    this.state.texts = [];
    return this.publishGatewayState();
  }

  async setGameMetadata(metadata: GameMetadata): Promise<GatewayEnvelope> {
    this.state.metadata = normalizeMetadata(metadata);
    return this.publishGatewayState();
  }

  async setGameTexts(texts: GameText[]): Promise<GatewayEnvelope> {
    this.state.texts = normalizeTexts(texts);
    return this.publishGatewayState();
  }

  async setGameActions(actions: GameAction[]): Promise<GatewayEnvelope> {
    this.actionCallbacks.clear();
    this.state.actions = actions.map((action) => {
      if (action.onGameActionUsed) {
        this.actionCallbacks.set(action.id, action.onGameActionUsed);
      }
      return normalizeAction(action);
    });

    void this.subscribeToTransactions().catch((error) => {
      this.logger.warn("Gateway transaction subscription failed", error);
    });
    return this.publishGatewayState();
  }

  async enableGameAction(id: string): Promise<GatewayEnvelope> {
    return this.setActionState(id, GameActionState.Available);
  }

  async disableGameAction(id: string): Promise<GatewayEnvelope> {
    return this.setActionState(id, GameActionState.Unavailable);
  }

  async setMaximumGameActionCount(id: string, count: number): Promise<GatewayEnvelope> {
    return this.setGameActionCount(id, count);
  }

  async setGameActionCount(id: string, count: number): Promise<GatewayEnvelope> {
    const action = this.findAction(id);
    action.count = normalizeCount(count);
    return this.publishGatewayState();
  }

  async incrementGameActionCount(id: string, delta: number): Promise<GatewayEnvelope> {
    const action = this.findAction(id);
    action.count = normalizeCount(action.count + Math.trunc(delta));
    return this.publishGatewayState();
  }

  async decrementGameActionCount(id: string, delta: number): Promise<GatewayEnvelope> {
    return this.incrementGameActionCount(id, -delta);
  }

  async acceptGameAction(used: GameActionUsed, description: string): Promise<GatewayEnvelope> {
    return this.request("validate", "transaction", {
      transaction_id: used.transactionId,
      details: description
    });
  }

  async refundGameAction(used: GameActionUsed, _description: string): Promise<GatewayEnvelope> {
    return this.request("refund", "transaction", {
      transaction_id: used.transactionId,
      user_id: used.userId
    });
  }

  async startPoll(config: PollConfiguration): Promise<GatewayEnvelope> {
    const poll = normalizePoll(config);
    this.currentPoll = poll;

    const response = await this.request("create", "poll", {
      poll_id: poll.id,
      prompt: poll.prompt,
      options: poll.options,
      user_data: {
        gateway: true,
        location: poll.location,
        mode: poll.mode,
        duration_in_seconds: poll.durationInSeconds
      }
    });

    await this.request("subscribe", "poll", { topic_id: poll.id });

    if (poll.durationInSeconds > 0) {
      this.pollTimer = setTimeout(() => {
        void this.stopPoll(true);
      }, poll.durationInSeconds * 1000);
    }

    return response;
  }

  async stopPoll(final = false): Promise<GatewayEnvelope | undefined> {
    if (!this.currentPoll) {
      return undefined;
    }

    const poll = this.currentPoll;
    this.clearPollTimer();
    this.currentPoll = null;

    if (final) {
      this.emitPollUpdate(toPollUpdate(poll.id, [], true));
    }

    await this.request("unsubscribe", "poll", { topic_id: poll.id }).catch(() => undefined);
    return this.request("delete", "poll", { poll_id: poll.id });
  }

  async subscribeToTransactions(sku = "*"): Promise<GatewayEnvelope> {
    return this.request("subscribe", "twitchPurchaseBits", { sku });
  }

  sendRaw(envelope: GatewayEnvelope): void {
    this.ensureTransport();
    this.transport?.send(envelope);
  }

  private sendFireAndForget<TData>(action: string, target?: string, data?: TData): void {
    this.ensureTransport();
    const envelope = createRequest(action, this.requestIds.next(), target, data);
    this.emitter.emit("request", envelope);
    this.transport?.send(envelope);
  }

  private async request<TData>(
    action: string,
    target?: string,
    data?: TData
  ): Promise<GatewayEnvelope> {
    this.ensureTransport();
    const id = this.requestIds.next();
    const envelope = createRequest(action, id, target, data);
    this.emitter.emit("request", envelope);

    const pending = new Promise<GatewayEnvelope>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.transport?.send(envelope);
    return pending;
  }

  private receive(envelope: GatewayEnvelope): void {
    this.emitter.emit("message", envelope);
    const hadPendingRequest = this.resolvePending(envelope);
    this.routeEvent(envelope, hadPendingRequest);
  }

  private resolvePending(envelope: GatewayEnvelope): boolean {
    const id = requestIdOf(envelope);
    if (typeof id !== "number") {
      return false;
    }

    const pending = this.pending.get(id);
    if (!pending) {
      return false;
    }

    this.pending.delete(id);
    if (isOk(envelope) || actionOf(envelope) === "authenticate") {
      pending.resolve(envelope);
    } else {
      pending.reject(envelope.errors);
    }
    return true;
  }

  private routeEvent(envelope: GatewayEnvelope, hadPendingRequest = false): void {
    if (envelope.errors?.length) {
      this.emitter.emit("error", envelope.errors);
      this.emitter.emit("debug", envelope.errors);
    }

    const action = actionOf(envelope);
    const target = targetOf(envelope);

    if (target === "authentication" || action === "authenticate") {
      if (!hadPendingRequest) {
        const response = this.toAuthenticationResponse(envelope);
        this.emitter.emit("authentication", response);
      }
      return;
    }

    if (envelope.errors?.length) {
      return;
    }

    if (target === "poll" && action === "update") {
      const data = envelope.data as { topic_id?: string; results?: number[] } | undefined;
      const pollId = data?.topic_id ?? this.currentPoll?.id;
      if (pollId && Array.isArray(data?.results)) {
        this.emitPollUpdate(toPollUpdate(pollId, data.results));
      }
      return;
    }

    if ((target === "transaction_complete" || target === "twitchPurchaseBits") && action === "update") {
      this.emitTransaction(envelope.data);
      return;
    }
  }

  private handleAuthenticationResponse(envelope: GatewayEnvelope): AuthenticationResponse {
    const response = this.toAuthenticationResponse(envelope);
    this.authenticated = !response.hasError;

    if (response.jwt) {
      this.jwt = response.jwt;
    }

    if (response.refreshToken) {
      this.storage.setItem(this.storageKey, response.refreshToken);
    }

    this.emitter.emit("authentication", response);
    return response;
  }

  private toAuthenticationResponse(envelope: GatewayEnvelope): AuthenticationResponse {
    const data = (envelope.data ?? {}) as Record<string, unknown>;
    return {
      jwt: String(data.jwt ?? ""),
      refreshToken: String(data.refresh ?? data.refreshToken ?? ""),
      twitchUsername: String(data.twitch_name ?? data.twitchUsername ?? data.username ?? ""),
      hasError: Boolean(envelope.errors?.length),
      errors: envelope.errors
    };
  }

  private async publishGatewayState(): Promise<GatewayEnvelope> {
    const requests: Promise<GatewayEnvelope>[] = [];

    if (this.state.metadata) {
      requests.push(this.request("set", "gameMetadata", this.state.metadata));
    }

    if (this.state.actions) {
      requests.push(
        this.request("set", "gatewayActions", {
          actions: this.state.actions.map((action) => this.toGatewayActionPayload(action))
        })
      );
    }

    if (this.state.texts) {
      requests.push(
        this.request("patch", "state", {
          state_id: "channel",
          state: [
            {
              op: "add",
              path: "/game/text/game_data",
              value: this.state.texts
            }
          ]
        })
      );
    }

    if (requests.length === 0) {
      return this.request("set", "gameMetadata", { name: "", logo: "", theme: "" });
    }

    const responses = await Promise.all(requests);
    return responses[responses.length - 1] as GatewayEnvelope;
  }

  private async setActionState(id: string, state: GameActionState): Promise<GatewayEnvelope> {
    this.findAction(id).state = state;
    return this.publishGatewayState();
  }

  private findAction(id: string): ReturnType<typeof normalizeAction> {
    const action = this.state.actions?.find((entry) => entry.id === id);
    if (!action) {
      throw new Error(`Unknown Gateway action "${id}"`);
    }
    return action;
  }

  private toGatewayActionPayload(action: ReturnType<typeof normalizeAction>): GatewayActionPayload {
    return {
      ...action,
      category: this.toGatewayActionCategory(action.category),
      state: this.toGatewayActionState(action.state)
    };
  }

  private toGatewayActionCategory(category: GameActionCategory): GatewayActionPayload["category"] {
    switch (category) {
      case GameActionCategory.Hinder:
        return "hinder";
      case GameActionCategory.Help:
        return "help";
      case GameActionCategory.Neutral:
      default:
        return "neutral";
    }
  }

  private toGatewayActionState(state: GameActionState): GatewayActionPayload["state"] {
    switch (state) {
      case GameActionState.Available:
        return "available";
      case GameActionState.Hidden:
        return "hidden";
      case GameActionState.Unavailable:
      default:
        return "unavailable";
    }
  }

  private emitPollUpdate(update: PollUpdate): void {
    this.currentPoll?.onPollUpdate(update);
    this.emitter.emit("pollUpdate", update);
  }

  private emitTransaction(data: unknown): void {
    const raw = (data ?? {}) as Record<string, unknown>;
    const bits: BitsUsed = {
      transactionId: String(raw.id ?? raw.transaction_id ?? ""),
      sku: String(raw.sku ?? ""),
      bits: Number(raw.cost ?? raw.bits ?? 0),
      userId: String(raw.userId ?? raw.user_id ?? ""),
      username: String(raw.username ?? raw.displayName ?? "")
    };

    this.emitter.emit("bitsUsed", bits);

    const actionId = String(raw.action_id ?? raw.actionId ?? raw.sku ?? "");
    if (actionId && this.state.actions?.some((action) => action.id === actionId)) {
      const used: GameActionUsed = {
        transactionId: bits.transactionId,
        actionId,
        cost: bits.bits,
        userId: bits.userId,
        username: bits.username,
        raw: data
      };
      this.actionCallbacks.get(actionId)?.(used);
      this.emitter.emit("actionUsed", used);
    }
  }

  private ensureTransport(): void {
    if (!this.transport) {
      this.connect();
    }
  }

  private clearPollTimer(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
