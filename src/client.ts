import { notifyListener, TypedEmitter } from "./events";
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
  type HypelineClientOptions,
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
  normalizeGameId,
  normalizeMetadata,
  normalizePoll,
  normalizeTexts
} from "./validation";

type PendingRequest = {
  resolve: (value: GatewayEnvelope) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  cancelQueued?: () => void;
  authentication: boolean;
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

export class HypelineClient {
  private readonly listenerError = () => this.logger.warn("Hypeline event listener failed");
  private readonly emitter = new TypedEmitter(this.listenerError);
  private readonly recentTransactions = new Set<string>();
  private sessionUser = "";
  private pollOperation = Promise.resolve();
  private readonly requestIds = new RequestIds();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly storage: StorageAdapter;
  private readonly gameId: string;
  private generation = 0;
  private authAttempt = 0;
  private disposed = false;
  private sessionRefresh = "";
  private restoreOnOpen = false;
  private signingOut = false;
  private logout?: Promise<void>;
  private readonly deferredWrites = new Map<keyof GatewayState, {
    promise: Promise<GatewayEnvelope>;
    send: () => void;
    reject: (reason: Error) => void;
  }>();
  private readonly logger: Pick<Console, "debug" | "info" | "warn" | "error">;
  private readonly actionCallbacks = new Map<string, (used: GameActionUsed) => void>();
  private readonly state: GatewayState;
  private transport: BrowserTransport | null = null;
  private stage: Stage;
  private currentPoll: Required<PollConfiguration> | null = null;
  private pollResults: number[] = [];
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subscriptions = new Map<string, Promise<GatewayEnvelope>>();
  private readonly desiredSubscriptions = new Set<string>();
  private authenticated = false;

  constructor(private readonly options: HypelineClientOptions) {
    this.gameId = normalizeGameId(options.gameId);
    if (options.requestTimeoutMs !== undefined &&
      (!Number.isFinite(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)) {
      throw new Error("Gateway request timeout must be a positive finite number");
    }
    if (options.maxQueuedMessages !== undefined &&
      (!Number.isInteger(options.maxQueuedMessages) || options.maxQueuedMessages < 1)) {
      throw new Error("Gateway queue limit must be a positive integer");
    }

    this.stage = options.stage ?? "production";
    this.storage = options.storage ?? defaultStorage();
    if (this.stage === "production" && !options.storageKey && this.gameId !== options.gameId) {
      const oldKey = `muxy.gateway.${options.gameId}.refreshToken`;
      const saved = this.storage.getItem(oldKey);
      if (saved && options.rememberSession !== false && !this.storage.getItem(this.storageKey)) {
        this.storage.setItem(this.storageKey, saved);
      }
      this.storage.removeItem(oldKey);
    }
    if (options.rememberSession === false) this.storage.removeItem(this.storageKey);
    this.logger = options.logger ?? console;
    this.state = {};

    if (options.autoConnect) {
      this.connect();
    }
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  private get storageKey(): string {
    // Existing production installs and explicit custom keys keep their saved session.
    const base = this.options.storageKey ?? `muxy.gateway.${this.gameId}.refreshToken`;
    return this.stage === "production" ? base : `${base}.${this.stage}`;
  }

  get refreshToken(): string {
    if (this.options.rememberSession === false) return this.sessionRefresh;
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
    if (this.disposed || this.signingOut) throw new Error("Hypeline client is closed");
    if (this.transport) {
      this.transport.connect();
      return;
    }
    const override = this.options.endpoint;
    const endpoint = resolveEndpoint(this.stage, typeof override === "function"
      ? override(this.stage, this.options) : override);

    const transport: BrowserTransport = new BrowserTransport({
      url: endpoint,
      websocket: this.options.websocket,
      reconnect: this.options.reconnect,
      maxQueuedMessages: this.options.maxQueuedMessages,
      onOpen: (event) => {
        const restore = this.restoreOnOpen;
        this.restoreOnOpen = false;
        const attempt = this.authAttempt;
        this.emitter.emit("connect", event);
        if (restore && this.transport === transport && this.authAttempt === attempt && this.sessionRefresh) {
          void this.authenticateWithRefreshToken(this.sessionRefresh).catch(() => undefined);
        }
      },
      onClose: (event) => {
        if (this.transport !== transport) return;
        this.restoreOnOpen = !!this.sessionRefresh;
        this.endSession();
        this.emitter.emit("disconnect", event);
      },
      onError: (event) => this.emitter.emit("error", event),
      onMessage: (message) => this.receive(message)
    });
    this.transport = transport;
    try {
      transport.connect();
    } catch (error) {
      this.transport = null;
      throw error;
    }
  }

  private endSession(): void {
    ++this.generation;
    this.authenticated = false;
    this.subscriptions.clear();
    this.currentPoll = null;
    this.pollResults = [];
    this.clearPollTimer();
    const error = new Error("Gateway connection closed before the request completed");
    this.rejectPendingRequests(error);
    for (const write of this.deferredWrites.values()) write.reject(error);
    this.deferredWrites.clear();
  }

  disconnect(): void {
    const transport = this.transport;
    this.transport = null;
    this.restoreOnOpen = false;
    this.sessionRefresh = "";
    this.sessionUser = "";
    this.recentTransactions.clear();
    this.endSession();
    transport?.disconnect();
    if (transport) this.emitter.emit("disconnect", new Event("disconnect"));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disconnect();
    this.emitter.clear();
    this.actionCallbacks.clear();
    this.desiredSubscriptions.clear();
  }

  runInStaging(): void {
    this.disconnect();
    this.stage = "staging";
    this.connect();
  }

  /** @deprecated The hosted sandbox has retired. Use production for channel tests. */
  runInSandbox(): void {
    this.disconnect();
    this.stage = "sandbox";
    this.connect();
  }

  runInProduction(): void {
    this.disconnect();
    this.stage = "production";
    this.connect();
  }

  async authenticateWithPin(pin: string): Promise<AuthenticationResponse> {
    const code = pin.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Enter the six-character Twitch link code");
    return this.authenticate({ pin: code });
  }

  async authenticateWithRefreshToken(refresh = this.refreshToken): Promise<AuthenticationResponse> {
    if (!refresh.trim()) throw new Error("A refresh token is required");
    return this.authenticate({ refresh });
  }

  private async authenticate(credentials: { pin: string } | { refresh: string }): Promise<AuthenticationResponse> {
    this.restoreOnOpen = false;
    const generation = this.generation;
    const attempt = ++this.authAttempt;
    this.authenticated = false;
    const response = await this.request("authenticate", undefined, {
      ...credentials, client_id: GATEWAY_EXTENSION_CLIENT_ID, game_id: this.gameId
    });
    if (this.generation !== generation || this.authAttempt !== attempt) throw new Error("Session changed");
    return this.handleAuthenticationResponse(response, "refresh" in credentials ? credentials.refresh : "");
  }

  deauthenticate(): Promise<void> {
    return this.logout ??= this.signOut().finally(() => { this.logout = undefined; });
  }

  private async signOut(): Promise<void> {
    this.signingOut = true;
    const transport = this.transport;
    this.endSession();
    this.sessionRefresh = "";
    this.restoreOnOpen = false;
    try {
      this.storage.removeItem(this.storageKey);
      if (transport?.isOpen) {
        transport.send(createRequest("deauthenticate", this.requestIds.next()));
        await transport.drain(1000);
      }
    } finally {
      this.disconnect();
      this.desiredSubscriptions.clear();
      this.signingOut = false;
    }
  }

  async clearGameState(): Promise<GatewayEnvelope> {
    this.actionCallbacks.clear();
    this.state.metadata = normalizeMetadata({ name: "", logo: "", theme: "" });
    this.state.actions = [];
    this.state.texts = [];
    const responses = await Promise.all([
      this.publishState("metadata"), this.publishState("actions"), this.publishState("texts")
    ]);
    return responses[2];
  }

  async setGameMetadata(metadata: GameMetadata): Promise<GatewayEnvelope> {
    this.state.metadata = normalizeMetadata(metadata);
    return this.publishState("metadata");
  }

  async setGameTexts(texts: GameText[]): Promise<GatewayEnvelope> {
    this.state.texts = normalizeTexts(texts);
    return this.publishState("texts");
  }

  async setGameActions(actions: GameAction[]): Promise<GatewayEnvelope> {
    const normalized = actions.map(normalizeAction);
    if (new Set(normalized.map(action => action.id)).size !== actions.length) {
      throw new Error("Duplicate action ID");
    }
    this.state.actions = normalized;
    this.actionCallbacks.clear();
    for (const action of actions) {
      if (action.onGameActionUsed) this.actionCallbacks.set(action.id, action.onGameActionUsed);
    }
    return this.publishState("actions");
  }

  async enableGameAction(id: string): Promise<GatewayEnvelope> {
    return this.setActionState(id, GameActionState.Available);
  }

  async disableGameAction(id: string): Promise<GatewayEnvelope> {
    return this.setActionState(id, GameActionState.Unavailable);
  }

  async setMaximumGameActionCount(id: string, count: number): Promise<GatewayEnvelope> {
    return this.updateAction(id, { count: normalizeCount(count) });
  }

  async setGameActionCount(id: string, count: number): Promise<GatewayEnvelope> {
    return this.updateAction(id, { inventory: normalizeCount(count) });
  }

  async incrementGameActionCount(id: string, delta: number): Promise<GatewayEnvelope> {
    if (!Number.isInteger(delta) || Math.abs(delta) > 0x7fffffff) throw new Error("Invalid inventory delta");
    return this.updateAction(id, { delta_inventory: { change: delta } });
  }

  async decrementGameActionCount(id: string, delta: number): Promise<GatewayEnvelope> {
    return this.incrementGameActionCount(id, -delta);
  }

  async acceptGameAction(used: GameActionUsed, description: string): Promise<GatewayEnvelope> {
    this.requireAuthentication();
    return this.request("validate", "transaction", {
      transaction_id: used.transactionId,
      details: description
    });
  }

  async refundGameAction(used: GameActionUsed, _description: string): Promise<GatewayEnvelope> {
    this.requireAuthentication();
    return this.request("refund", "transaction", {
      transaction_id: used.transactionId,
      user_id: used.userId
    });
  }

  async startPoll(config: PollConfiguration): Promise<GatewayEnvelope> {
    const poll = normalizePoll(config);
    this.requireAuthentication();
    return this.serializePoll(async () => {
      if (this.currentPoll) await this.closePoll(false);
      this.requireAuthentication();
      return this.openPoll(poll);
    });
  }

  private serializePoll<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const result = this.pollOperation.then(() => {
      if (generation !== this.generation) throw new Error("Session changed");
      return operation();
    });
    this.pollOperation = result.then(() => undefined, () => undefined);
    return result;
  }

  private async openPoll(poll: Required<PollConfiguration>): Promise<GatewayEnvelope> {
    const generation = this.generation;
    this.currentPoll = poll;
    this.pollResults = [];
    let created = false;

    try {
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

      if (this.generation !== generation) throw new Error("Session changed");
      created = true;
      await this.request("subscribe", "poll", { topic_id: poll.id });
      if (this.generation !== generation) throw new Error("Session changed");

      if (poll.durationInSeconds > 0) {
        this.pollTimer = setTimeout(() => {
          void this.serializePoll(async () => {
            if (this.currentPoll === poll) await this.closePoll(true);
          }).catch(() => this.logger.warn("Hypeline poll cleanup failed"));
        }, poll.durationInSeconds * 1000);
      }

      return response;
    } catch (error) {
      if (this.currentPoll === poll) {
        this.currentPoll = null;
        if (created && this.generation === generation) {
          await this.request("delete", "poll", { poll_id: poll.id }).catch(() => undefined);
        }
      }
      throw error;
    }
  }

  async stopPoll(final = false): Promise<GatewayEnvelope | undefined> {
    return this.serializePoll(() => this.closePoll(final));
  }

  private async closePoll(final: boolean): Promise<GatewayEnvelope | undefined> {
    if (!this.currentPoll) {
      return undefined;
    }

    const generation = this.generation;
    const poll = this.currentPoll;
    this.clearPollTimer();

    if (final) {
      this.emitPollUpdate(toPollUpdate(poll.id, this.pollResults, true));
    }
    this.currentPoll = null;
    this.pollResults = [];

    if (this.generation !== generation) throw new Error("Session changed");
    await this.request("unsubscribe", "poll", { topic_id: poll.id }).catch(() => undefined);
    if (this.generation !== generation) throw new Error("Session changed");
    return this.request("delete", "poll", { poll_id: poll.id });
  }

  async subscribeToTransactions(sku = "*"): Promise<GatewayEnvelope> {
    this.requireAuthentication();
    const existing = this.subscriptions.get(sku);
    if (existing) return existing;
    const subscription = this.request("subscribe", "twitchPurchaseBits", { sku });
    this.subscriptions.set(sku, subscription);
    try {
      const response = await subscription;
      if (this.subscriptions.get(sku) === subscription) this.desiredSubscriptions.add(sku);
      return response;
    } catch (error) {
      if (this.subscriptions.get(sku) === subscription) this.subscriptions.delete(sku);
      throw error;
    }
  }

  sendRaw(envelope: GatewayEnvelope): void {
    this.ensureTransport();
    this.transport?.send(envelope);
  }

  private async request<TData>(
    action: string,
    target?: string,
    data?: TData
  ): Promise<GatewayEnvelope> {
    this.ensureTransport();
    if (this.signingOut) throw new Error("Sign-out in progress");
    if (this.pending.size >= 0xfffe) throw new Error("Too many pending requests");
    let id = this.requestIds.next();
    while (this.pending.has(id)) id = this.requestIds.next();
    const envelope = createRequest(action, id, target, data);

    const pending = new Promise<GatewayEnvelope>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs ?? 30_000;
      const timer = setTimeout(() => {
        const entry = this.pending.get(id);
        if (!entry) return;
        entry.cancelQueued?.();
        this.pending.delete(id);
        entry.reject(new Error(`Gateway request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, authentication: action === "authenticate" });
    });

    try {
      const entry = this.pending.get(id)!;
      entry.cancelQueued = this.transport!.send(envelope);
      this.emitter.emit("request", diagnosticEnvelope(envelope, entry.authentication));
    } catch (error) {
      const entry = this.pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.reject(error);
      }
    }
    return pending;
  }

  private receive(envelope: GatewayEnvelope): void {
    const id = requestIdOf(envelope);
    const auth = actionOf(envelope) === "authenticate" || targetOf(envelope) === "authentication" ||
      (id !== undefined && this.pending.get(id)?.authentication === true);
    this.emitter.emit("message", diagnosticEnvelope(envelope, auth));
    this.resolvePending(envelope);
    this.routeEvent(envelope, auth);
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
    clearTimeout(pending.timer);
    if (isOk(envelope) || pending.authentication) {
      pending.resolve(envelope);
    } else {
      pending.reject(envelope.errors);
    }
    return true;
  }

  private routeEvent(envelope: GatewayEnvelope, auth: boolean): void {
    if (envelope.errors?.length) {
      const errors = diagnosticEnvelope(envelope, auth).errors!;
      this.emitter.emit("error", errors);
      this.emitter.emit("debug", errors);
    }

    const action = actionOf(envelope);
    const target = targetOf(envelope);

    if (auth || envelope.errors?.length || !this.authenticated) {
      return;
    }

    if (target === "poll" && action === "update") {
      const data = envelope.data as { topic_id?: string; results?: number[] } | undefined;
      const pollId = data?.topic_id ?? this.currentPoll?.id;
      if (pollId && Array.isArray(data?.results)) {
        if (this.currentPoll?.id === pollId) {
          this.pollResults = [...data.results];
        }
        this.emitPollUpdate(toPollUpdate(pollId, data.results));
      }
      return;
    }

    if ((target === "transaction_complete" || target === "twitchPurchaseBits") && action === "update") {
      this.emitTransaction(envelope.data);
      return;
    }
  }

  private handleAuthenticationResponse(envelope: GatewayEnvelope, previousRefresh: string): AuthenticationResponse {
    const response = this.toAuthenticationResponse(envelope);
    this.authenticated = !response.hasError;

    if (response.hasError) {
      this.sessionRefresh = "";
      this.storage.removeItem(this.storageKey);
      for (const write of this.deferredWrites.values()) write.reject(new Error("Authentication failed"));
      this.deferredWrites.clear();
    } else {
      if (response.twitchUsername !== this.sessionUser) {
        this.recentTransactions.clear();
        this.subscriptions.clear();
      }
      this.sessionUser = response.twitchUsername;
      this.sessionRefresh = response.refreshToken || previousRefresh;
      if (this.options.rememberSession !== false) {
        if (this.sessionRefresh) this.storage.setItem(this.storageKey, this.sessionRefresh);
        else this.storage.removeItem(this.storageKey);
      }
      for (const sku of this.desiredSubscriptions) this.subscribeInBackground(sku);
      for (const write of this.deferredWrites.values()) write.send();
      this.deferredWrites.clear();
    }

    this.emitter.emit("authentication", response);
    return response;
  }

  private toAuthenticationResponse(envelope: GatewayEnvelope): AuthenticationResponse {
    const data = (envelope.data ?? {}) as Record<string, unknown>;
    const jwt = typeof data.jwt === "string" ? data.jwt : "";
    const errors = envelope.errors?.length ? envelope.errors :
      jwt ? undefined : [{ title: "Authentication response did not include a session token" }];
    return {
      jwt,
      refreshToken: String(data.refresh ?? data.refreshToken ?? ""),
      twitchUsername: String(data.twitch_name ?? data.twitchUsername ?? data.username ?? ""),
      hasError: Boolean(errors),
      errors
    };
  }

  private publishState(key: keyof GatewayState): Promise<GatewayEnvelope> {
    this.ensureTransport();
    if (this.authenticated) return this.writeState(key);
    const existing = this.deferredWrites.get(key);
    if (existing) return existing.promise;

    let send!: () => void;
    let cancel!: (error: Error) => void;
    const promise = new Promise<GatewayEnvelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.deferredWrites.delete(key);
        reject(new Error("State update timed out waiting for authentication"));
      }, this.options.requestTimeoutMs ?? 30_000);
      send = () => { clearTimeout(timer); resolve(this.writeState(key)); };
      cancel = error => { clearTimeout(timer); reject(error); };
    });
    this.deferredWrites.set(key, { promise, send, reject: cancel });
    return promise;
  }

  private writeState(key: keyof GatewayState): Promise<GatewayEnvelope> {
    if (key === "metadata") return this.request("set", "gameMetadata", this.state.metadata);
    if (key === "actions") {
      if (this.state.actions?.length) this.subscribeInBackground("*");
      return this.request("set", "gatewayActions", {
        actions: (this.state.actions ?? []).map(action => this.toGatewayActionPayload(action))
      });
    }
    return this.request("patch", "state", {
      state_id: "channel",
      state: [{ op: "add", path: "/game/text/game_data", value: this.state.texts }]
    });
  }

  private subscribeInBackground(sku: string): void {
    if (!this.subscriptions.has(sku)) {
      void this.subscribeToTransactions(sku).catch(() => this.logger.warn("Hypeline subscription failed"));
    }
  }

  private requireAuthentication(): void {
    if (!this.authenticated || this.signingOut || this.disposed) throw new Error("Sign in to Hypeline first");
  }

  private updateAction(id: string, change: Record<string, unknown>): Promise<GatewayEnvelope> {
    this.requireAuthentication();
    this.findAction(id);
    return this.request("set", "gatewayActionState", { id, ...change });
  }

  private setActionState(id: string, state: GameActionState): Promise<GatewayEnvelope> {
    return this.updateAction(id, { state: this.toGatewayActionState(state) });
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
    if (this.currentPoll?.id === update.pollId) notifyListener(this.currentPoll.onPollUpdate, update, this.listenerError);
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

    if (!bits.transactionId || this.recentTransactions.has(bits.transactionId)) return;
    this.recentTransactions.add(bits.transactionId);
    if (this.recentTransactions.size > 1024) {
      this.recentTransactions.delete(this.recentTransactions.values().next().value!);
    }
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
      const callback = this.actionCallbacks.get(actionId);
      if (callback) notifyListener(callback, used, this.listenerError);
      this.emitter.emit("actionUsed", used);
    }
  }

  private ensureTransport(): void {
    if (this.disposed || this.signingOut) throw new Error("Hypeline client is closed");
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

  private rejectPendingRequests(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.cancelQueued?.();
      this.pending.delete(id);
      pending.reject(error);
    }
  }
}

/** @deprecated Use HypelineClient. */
export { HypelineClient as GatewayClient };

function diagnosticEnvelope(envelope: GatewayEnvelope, authentication: boolean): GatewayEnvelope {
  const data = envelope.data;
  if (authentication || (data && typeof data === "object" &&
      ["pin", "jwt", "refresh", "refreshToken"].some(key => key in data))) {
    return {
      action: actionOf(envelope), params: { request_id: requestIdOf(envelope), target: targetOf(envelope) },
      errors: envelope.errors?.map(({ status }) => ({ status }))
    };
  }
  return envelope;
}
