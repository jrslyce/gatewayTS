"use strict";
var HypelineHTML5 = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    DEFAULT_PRODUCTION_ENDPOINT: () => DEFAULT_PRODUCTION_ENDPOINT,
    DEFAULT_SANDBOX_ENDPOINT: () => DEFAULT_SANDBOX_ENDPOINT,
    DEFAULT_STAGING_ENDPOINT: () => DEFAULT_STAGING_ENDPOINT,
    GATEWAY_EXTENSION_CLIENT_ID: () => GATEWAY_EXTENSION_CLIENT_ID,
    GameActionCategory: () => GameActionCategory,
    GameActionState: () => GameActionState,
    GatewayClient: () => HypelineClient,
    HypelineClient: () => HypelineClient,
    InfiniteCount: () => InfiniteCount,
    PollLocation: () => PollLocation,
    PollMode: () => PollMode,
    createAuthWidget: () => createAuthWidget,
    createNotificationHistory: () => createNotificationHistory,
    createPollingWidget: () => createPollingWidget
  });

  // src/events.ts
  function notifyListener(listener, value, onError) {
    try {
      const result = listener(value);
      if (result && typeof result.then === "function") {
        void Promise.resolve(result).catch(onError);
      }
    } catch {
      onError();
    }
  }
  var TypedEmitter = class {
    constructor(onError) {
      this.onError = onError;
      this.listeners = /* @__PURE__ */ new Map();
    }
    on(event, listener) {
      const bucket = this.listeners.get(event) ?? /* @__PURE__ */ new Set();
      bucket.add(listener);
      this.listeners.set(event, bucket);
      return () => this.off(event, listener);
    }
    off(event, listener) {
      this.listeners.get(event)?.delete(listener);
    }
    emit(event, payload) {
      for (const listener of this.listeners.get(event) ?? []) {
        notifyListener(listener, payload, this.onError);
      }
    }
    clear() {
      this.listeners.clear();
    }
  };

  // src/poll.ts
  function toPollUpdate(pollId, results, isFinal = false) {
    const normalizedResults = results.map((value) => Math.max(0, Math.trunc(value || 0)));
    const count = normalizedResults.reduce((sum, value) => sum + value, 0);
    let winner = 0;
    let winningVoteCount = normalizedResults[0] ?? 0;
    normalizedResults.forEach((value, index) => {
      if (value > winningVoteCount) {
        winner = index;
        winningVoteCount = value;
      }
    });
    const weighted = normalizedResults.reduce((sum, value, index) => sum + value * index, 0);
    return {
      pollId,
      winner,
      winningVoteCount,
      results: normalizedResults,
      count,
      mean: count === 0 ? 0 : weighted / count,
      isFinal
    };
  }

  // src/types.ts
  var GATEWAY_EXTENSION_CLIENT_ID = "i575hs2x9lb3u8hqujtezit03w1740";
  var DEFAULT_PRODUCTION_ENDPOINT = "wss://gamelink.muxy.io/0.2.0/gateway-unity/0.1.0/i575hs2x9lb3u8hqujtezit03w1740";
  var DEFAULT_STAGING_ENDPOINT = DEFAULT_PRODUCTION_ENDPOINT.replace("gamelink.muxy.io", "gamelink.staging.muxy.io");
  var DEFAULT_SANDBOX_ENDPOINT = "wss://gamelink.sandbox.muxy.io/0.2.0/gateway-unity/0.1.0/i575hs2x9lb3u8hqujtezit03w1740";
  var GameActionCategory = /* @__PURE__ */ ((GameActionCategory2) => {
    GameActionCategory2[GameActionCategory2["Neutral"] = 0] = "Neutral";
    GameActionCategory2[GameActionCategory2["Hinder"] = 1] = "Hinder";
    GameActionCategory2[GameActionCategory2["Help"] = 2] = "Help";
    return GameActionCategory2;
  })(GameActionCategory || {});
  var GameActionState = /* @__PURE__ */ ((GameActionState2) => {
    GameActionState2[GameActionState2["Unavailable"] = 0] = "Unavailable";
    GameActionState2[GameActionState2["Available"] = 1] = "Available";
    GameActionState2[GameActionState2["Hidden"] = 2] = "Hidden";
    return GameActionState2;
  })(GameActionState || {});
  var InfiniteCount = 65535;
  var PollLocation = /* @__PURE__ */ ((PollLocation2) => {
    PollLocation2[PollLocation2["Default"] = 0] = "Default";
    return PollLocation2;
  })(PollLocation || {});
  var PollMode = /* @__PURE__ */ ((PollMode2) => {
    PollMode2[PollMode2["Chaos"] = 0] = "Chaos";
    PollMode2[PollMode2["Order"] = 1] = "Order";
    return PollMode2;
  })(PollMode || {});

  // src/protocol.ts
  var MAX_REQUEST_ID = 65535;
  var RequestIds = class {
    constructor() {
      this.nextValue = 1;
    }
    next() {
      const value = this.nextValue;
      this.nextValue = this.nextValue >= MAX_REQUEST_ID - 1 ? 1 : this.nextValue + 1;
      return value;
    }
  };
  function resolveEndpoint(stage, endpoint) {
    const override = typeof endpoint === "function" ? endpoint(stage) : endpoint;
    if (!override && stage === "sandbox") {
      throw new Error("The sandbox service is retired. Use production or specify a test endpoint.");
    }
    const address = override ?? (stage === "staging" ? DEFAULT_STAGING_ENDPOINT : DEFAULT_PRODUCTION_ENDPOINT);
    validateEndpoint(address);
    return address;
  }
  function validateEndpoint(address) {
    let url;
    try {
      url = new URL(address);
    } catch {
      throw new Error("Invalid Hypeline WebSocket endpoint");
    }
    const loopback = url.hostname === "localhost" || url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
    if (url.username || url.password || url.hash || !(url.protocol === "wss:" || url.protocol === "ws:" && loopback)) {
      throw new Error("Use wss:// for remote endpoints or ws:// on loopback only");
    }
  }
  function createRequest(action, requestId, target, data) {
    const request = {
      action,
      params: { request_id: requestId }
    };
    if (target) {
      request.params = { ...request.params, target };
    }
    if (typeof data !== "undefined") {
      request.data = data;
    }
    return request;
  }
  function requestIdOf(envelope) {
    return envelope.meta?.request_id ?? envelope.params?.request_id;
  }
  function targetOf(envelope) {
    return String(envelope.meta?.target ?? envelope.params?.target ?? "");
  }
  function actionOf(envelope) {
    return String(envelope.meta?.action ?? envelope.action ?? "");
  }
  function parseEnvelope(input) {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Gateway message was not an object");
    }
    return parsed;
  }
  function isOk(envelope) {
    return !envelope.errors?.length;
  }

  // src/storage.ts
  var MemoryStorage = class {
    constructor() {
      this.values = /* @__PURE__ */ new Map();
    }
    getItem(key) {
      return this.values.get(key) ?? null;
    }
    setItem(key, value) {
      this.values.set(key, value);
    }
    removeItem(key) {
      this.values.delete(key);
    }
  };
  function defaultStorage() {
    try {
      if (globalThis.localStorage) return globalThis.localStorage;
    } catch {
    }
    return new MemoryStorage();
  }

  // src/transport.ts
  var MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
  var utf8 = new TextEncoder();
  var DEFAULT_RECONNECT = {
    initialDelayMs: 500,
    maxDelayMs: 3e4,
    factor: 2,
    jitter: true
  };
  var BrowserTransport = class {
    constructor(options) {
      this.options = options;
      this.socket = null;
      this.queue = /* @__PURE__ */ new Set();
      this.stopped = false;
      this.reconnectAttempt = 0;
      this.reconnectTimer = null;
      this.intentionalClose = false;
      validateEndpoint(options.url);
      const WebSocketImpl = options.websocket ?? globalThis.WebSocket;
      if (!WebSocketImpl) {
        throw new Error("No WebSocket implementation is available");
      }
      this.websocket = WebSocketImpl;
    }
    get isOpen() {
      return this.socket?.readyState === this.websocket.OPEN;
    }
    connect() {
      if (this.socket) return;
      this.stopped = false;
      this.intentionalClose = false;
      this.clearReconnectTimer();
      const socket = new this.websocket(this.options.url);
      this.socket = socket;
      socket.onopen = (event) => {
        if (this.socket !== socket) return;
        this.reconnectAttempt = 0;
        this.flush();
        this.options.onOpen(event);
      };
      socket.onmessage = (event) => {
        if (this.socket !== socket) return;
        const data = event.data;
        if (typeof data !== "string" || data.length > MAX_MESSAGE_BYTES || data.length > MAX_MESSAGE_BYTES / 3 && utf8.encode(data).length > MAX_MESSAGE_BYTES) {
          this.disconnect(4002, "Invalid WebSocket message");
          this.options.onError(new Event("protocolerror"));
          return;
        }
        try {
          this.options.onMessage(parseEnvelope(event.data));
        } catch {
          this.options.onError(new Event("Gateway message could not be parsed"));
        }
      };
      socket.onerror = (event) => {
        if (this.socket === socket) this.options.onError(event);
      };
      socket.onclose = (event) => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.queue.clear();
        if (!this.intentionalClose && this.options.reconnect !== false) {
          this.scheduleReconnect();
        } else {
          this.stopped = true;
        }
        this.options.onClose(event);
      };
    }
    disconnect(code = 1e3, reason = "going away") {
      this.intentionalClose = true;
      this.clearReconnectTimer();
      this.stopped = true;
      this.queue.clear();
      const socket = this.socket;
      this.socket = null;
      if (socket) {
        socket.onmessage = socket.onopen = socket.onerror = socket.onclose = null;
        try {
          socket.close(code, reason);
        } finally {
          this.options.onClose(new CloseEvent("close", { code, reason }));
        }
      }
    }
    send(envelope) {
      if (this.stopped) throw new Error("Hypeline connection is closed");
      const message = JSON.stringify(envelope);
      if (!this.isOpen) {
        const maxQueuedMessages = this.options.maxQueuedMessages ?? 100;
        if (this.queue.size >= maxQueuedMessages) {
          throw new Error(`Gateway transport queue is full (limit ${maxQueuedMessages})`);
        }
        const entry = { message };
        this.queue.add(entry);
        return () => {
          this.queue.delete(entry);
        };
      }
      this.socket?.send(message);
      return void 0;
    }
    flush() {
      for (const entry of this.queue) {
        if (!this.isOpen) break;
        this.queue.delete(entry);
        this.socket.send(entry.message);
      }
    }
    async drain(timeoutMs) {
      const socket = this.socket;
      const deadline = Date.now() + timeoutMs;
      while (this.socket === socket && this.isOpen && socket?.bufferedAmount && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    scheduleReconnect() {
      const reconnect = { ...DEFAULT_RECONNECT, ...this.options.reconnect || {} };
      const baseDelay = Math.min(
        reconnect.maxDelayMs,
        reconnect.initialDelayMs * Math.pow(reconnect.factor, this.reconnectAttempt)
      );
      const delay = Math.min(reconnect.maxDelayMs, reconnect.jitter ? baseDelay * (0.75 + Math.random() * 0.5) : baseDelay);
      this.reconnectAttempt += 1;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    }
    clearReconnectTimer() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  };

  // src/validation.ts
  var encoder = new TextEncoder();
  function limitBytes(value, limit, label) {
    if (value.length > limit || encoder.encode(value).byteLength > limit) {
      throw new Error(`${label} exceeds ${limit} UTF-8 bytes`);
    }
  }
  function normalizeGameId(raw) {
    const id = raw?.trim().toLowerCase();
    if (!id || id.length < 3 || id.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error("Game ID must be 3\u201364 lowercase letters or digits separated by single hyphens");
    }
    return id;
  }
  function normalizeMetadata(metadata) {
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
  function normalizeTexts(texts) {
    return texts.map((text) => ({
      label: String(text.label ?? ""),
      value: String(text.value ?? ""),
      icon: String(text.icon ?? "")
    }));
  }
  function normalizeAction(action) {
    if (!action.id?.trim() || action.id.length > 64) {
      throw new Error("Action ID must be nonempty and at most 64 characters");
    }
    const impact = action.impact;
    if (!Number.isInteger(impact) || impact < 0 || impact > 5) {
      throw new Error(`Gateway action "${action.id}" impact must be an integer from 0 to 5`);
    }
    if (action.category !== void 0 && ![0, 1, 2].includes(action.category) || action.state !== void 0 && ![0, 1, 2].includes(action.state)) {
      throw new Error("Invalid action category or state");
    }
    return {
      id: action.id,
      category: action.category ?? 0 /* Neutral */,
      state: action.state ?? 0 /* Unavailable */,
      impact,
      name: String(action.name ?? ""),
      description: String(action.description ?? ""),
      icon: String(action.icon ?? ""),
      count: normalizeCount(action.count)
    };
  }
  function normalizeCount(count = InfiniteCount) {
    if (!Number.isFinite(count)) {
      throw new Error("Gateway action count must be a finite number");
    }
    if (!Number.isInteger(count) || count < 0 || count > InfiniteCount) {
      throw new Error(`Gateway action count must be between 0 and ${InfiniteCount}`);
    }
    return count;
  }
  function normalizePoll(config) {
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
    if (rawDuration < 0 || duration > 2147483) {
      throw new Error("Poll duration must be between 0 and 2147483 seconds");
    }
    return {
      id: config.id ?? `gateway-poll-${Date.now().toString(36)}`,
      prompt: config.prompt,
      location: config.location ?? 0,
      mode: config.mode ?? 1 /* Order */,
      options: config.options.map(String),
      durationInSeconds: duration,
      onPollUpdate: config.onPollUpdate ?? (() => void 0)
    };
  }

  // src/client.ts
  var HypelineClient = class {
    constructor(options) {
      this.options = options;
      this.listenerError = () => this.logger.warn("Hypeline event listener failed");
      this.emitter = new TypedEmitter(this.listenerError);
      this.recentTransactions = /* @__PURE__ */ new Set();
      this.sessionUser = "";
      this.pollOperation = Promise.resolve();
      this.requestIds = new RequestIds();
      this.pending = /* @__PURE__ */ new Map();
      this.generation = 0;
      this.authAttempt = 0;
      this.disposed = false;
      this.sessionRefresh = "";
      this.restoreOnOpen = false;
      this.signingOut = false;
      this.deferredWrites = /* @__PURE__ */ new Map();
      this.actionCallbacks = /* @__PURE__ */ new Map();
      this.transport = null;
      this.currentPoll = null;
      this.pollResults = [];
      this.pollTimer = null;
      this.subscriptions = /* @__PURE__ */ new Map();
      this.desiredSubscriptions = /* @__PURE__ */ new Set();
      this.authenticated = false;
      this.gameId = normalizeGameId(options.gameId);
      if (options.requestTimeoutMs !== void 0 && (!Number.isFinite(options.requestTimeoutMs) || options.requestTimeoutMs <= 0)) {
        throw new Error("Gateway request timeout must be a positive finite number");
      }
      if (options.maxQueuedMessages !== void 0 && (!Number.isInteger(options.maxQueuedMessages) || options.maxQueuedMessages < 1)) {
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
    get isAuthenticated() {
      return this.authenticated;
    }
    get storageKey() {
      const base = this.options.storageKey ?? `muxy.gateway.${this.gameId}.refreshToken`;
      return this.stage === "production" ? base : `${base}.${this.stage}`;
    }
    get refreshToken() {
      if (this.options.rememberSession === false) return this.sessionRefresh;
      return this.storage.getItem(this.storageKey) ?? "";
    }
    on(event, listener) {
      return this.emitter.on(event, listener);
    }
    off(event, listener) {
      this.emitter.off(event, listener);
    }
    onActionUsed(listener) {
      return this.on("actionUsed", listener);
    }
    onBitsUsed(listener) {
      return this.on("bitsUsed", listener);
    }
    onPollUpdate(listener) {
      return this.on("pollUpdate", listener);
    }
    onDebug(listener) {
      return this.on("debug", listener);
    }
    connect() {
      if (this.disposed || this.signingOut) throw new Error("Hypeline client is closed");
      if (this.transport) {
        this.transport.connect();
        return;
      }
      const override = this.options.endpoint;
      const endpoint = resolveEndpoint(this.stage, typeof override === "function" ? override(this.stage, this.options) : override);
      const transport = new BrowserTransport({
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
            void this.authenticateWithRefreshToken(this.sessionRefresh).catch(() => void 0);
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
    endSession() {
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
    disconnect() {
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
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.disconnect();
      this.emitter.clear();
      this.actionCallbacks.clear();
      this.desiredSubscriptions.clear();
    }
    runInStaging() {
      this.disconnect();
      this.stage = "staging";
      this.connect();
    }
    /** @deprecated The hosted sandbox has retired. Use production for channel tests. */
    runInSandbox() {
      this.disconnect();
      this.stage = "sandbox";
      this.connect();
    }
    runInProduction() {
      this.disconnect();
      this.stage = "production";
      this.connect();
    }
    async authenticateWithPin(pin) {
      const code = pin.trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error("Enter the six-character Twitch link code");
      return this.authenticate({ pin: code });
    }
    async authenticateWithRefreshToken(refresh = this.refreshToken) {
      if (!refresh.trim()) throw new Error("A refresh token is required");
      return this.authenticate({ refresh });
    }
    async authenticate(credentials) {
      this.restoreOnOpen = false;
      const generation = this.generation;
      const attempt = ++this.authAttempt;
      this.authenticated = false;
      const response = await this.request("authenticate", void 0, {
        ...credentials,
        client_id: GATEWAY_EXTENSION_CLIENT_ID,
        game_id: this.gameId
      });
      if (this.generation !== generation || this.authAttempt !== attempt) throw new Error("Session changed");
      return this.handleAuthenticationResponse(response, "refresh" in credentials ? credentials.refresh : "");
    }
    deauthenticate() {
      return this.logout ?? (this.logout = this.signOut().finally(() => {
        this.logout = void 0;
      }));
    }
    async signOut() {
      this.signingOut = true;
      const transport = this.transport;
      this.endSession();
      this.sessionRefresh = "";
      this.restoreOnOpen = false;
      try {
        this.storage.removeItem(this.storageKey);
        if (transport?.isOpen) {
          transport.send(createRequest("deauthenticate", this.requestIds.next()));
          await transport.drain(1e3);
        }
      } finally {
        this.disconnect();
        this.desiredSubscriptions.clear();
        this.signingOut = false;
      }
    }
    async clearGameState() {
      this.actionCallbacks.clear();
      this.state.metadata = normalizeMetadata({ name: "", logo: "", theme: "" });
      this.state.actions = [];
      this.state.texts = [];
      const responses = await Promise.all([
        this.publishState("metadata"),
        this.publishState("actions"),
        this.publishState("texts")
      ]);
      return responses[2];
    }
    async setGameMetadata(metadata) {
      this.state.metadata = normalizeMetadata(metadata);
      return this.publishState("metadata");
    }
    async setGameTexts(texts) {
      this.state.texts = normalizeTexts(texts);
      return this.publishState("texts");
    }
    async setGameActions(actions) {
      const normalized = actions.map(normalizeAction);
      if (new Set(normalized.map((action) => action.id)).size !== actions.length) {
        throw new Error("Duplicate action ID");
      }
      this.state.actions = normalized;
      this.actionCallbacks.clear();
      for (const action of actions) {
        if (action.onGameActionUsed) this.actionCallbacks.set(action.id, action.onGameActionUsed);
      }
      return this.publishState("actions");
    }
    async enableGameAction(id) {
      return this.setActionState(id, 1 /* Available */);
    }
    async disableGameAction(id) {
      return this.setActionState(id, 0 /* Unavailable */);
    }
    async setMaximumGameActionCount(id, count) {
      return this.updateAction(id, { count: normalizeCount(count) });
    }
    async setGameActionCount(id, count) {
      return this.updateAction(id, { inventory: normalizeCount(count) });
    }
    async incrementGameActionCount(id, delta) {
      if (!Number.isInteger(delta) || Math.abs(delta) > 2147483647) throw new Error("Invalid inventory delta");
      return this.updateAction(id, { delta_inventory: { change: delta } });
    }
    async decrementGameActionCount(id, delta) {
      return this.incrementGameActionCount(id, -delta);
    }
    async acceptGameAction(used, description) {
      this.requireAuthentication();
      return this.request("validate", "transaction", {
        transaction_id: used.transactionId,
        details: description
      });
    }
    async refundGameAction(used, _description) {
      this.requireAuthentication();
      return this.request("refund", "transaction", {
        transaction_id: used.transactionId,
        user_id: used.userId
      });
    }
    async startPoll(config) {
      const poll = normalizePoll(config);
      this.requireAuthentication();
      return this.serializePoll(async () => {
        if (this.currentPoll) await this.closePoll(false);
        this.requireAuthentication();
        return this.openPoll(poll);
      });
    }
    serializePoll(operation) {
      const generation = this.generation;
      const result = this.pollOperation.then(() => {
        if (generation !== this.generation) throw new Error("Session changed");
        return operation();
      });
      this.pollOperation = result.then(() => void 0, () => void 0);
      return result;
    }
    async openPoll(poll) {
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
          }, poll.durationInSeconds * 1e3);
        }
        return response;
      } catch (error) {
        if (this.currentPoll === poll) {
          this.currentPoll = null;
          if (created && this.generation === generation) {
            await this.request("delete", "poll", { poll_id: poll.id }).catch(() => void 0);
          }
        }
        throw error;
      }
    }
    async stopPoll(final = false) {
      return this.serializePoll(() => this.closePoll(final));
    }
    async closePoll(final) {
      if (!this.currentPoll) {
        return void 0;
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
      await this.request("unsubscribe", "poll", { topic_id: poll.id }).catch(() => void 0);
      if (this.generation !== generation) throw new Error("Session changed");
      return this.request("delete", "poll", { poll_id: poll.id });
    }
    async subscribeToTransactions(sku = "*") {
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
    sendRaw(envelope) {
      this.ensureTransport();
      this.transport?.send(envelope);
    }
    async request(action, target, data) {
      this.ensureTransport();
      if (this.signingOut) throw new Error("Sign-out in progress");
      if (this.pending.size >= 65534) throw new Error("Too many pending requests");
      let id = this.requestIds.next();
      while (this.pending.has(id)) id = this.requestIds.next();
      const envelope = createRequest(action, id, target, data);
      const pending = new Promise((resolve, reject) => {
        const timeoutMs = this.options.requestTimeoutMs ?? 3e4;
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
        const entry = this.pending.get(id);
        entry.cancelQueued = this.transport.send(envelope);
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
    receive(envelope) {
      const id = requestIdOf(envelope);
      const auth = actionOf(envelope) === "authenticate" || targetOf(envelope) === "authentication" || id !== void 0 && this.pending.get(id)?.authentication === true;
      this.emitter.emit("message", diagnosticEnvelope(envelope, auth));
      this.resolvePending(envelope);
      this.routeEvent(envelope, auth);
    }
    resolvePending(envelope) {
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
    routeEvent(envelope, auth) {
      if (envelope.errors?.length) {
        const errors = diagnosticEnvelope(envelope, auth).errors;
        this.emitter.emit("error", errors);
        this.emitter.emit("debug", errors);
      }
      const action = actionOf(envelope);
      const target = targetOf(envelope);
      if (auth || envelope.errors?.length || !this.authenticated) {
        return;
      }
      if (target === "poll" && action === "update") {
        const data = envelope.data;
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
    handleAuthenticationResponse(envelope, previousRefresh) {
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
    toAuthenticationResponse(envelope) {
      const data = envelope.data ?? {};
      const jwt = typeof data.jwt === "string" ? data.jwt : "";
      const errors = envelope.errors?.length ? envelope.errors : jwt ? void 0 : [{ title: "Authentication response did not include a session token" }];
      return {
        jwt,
        refreshToken: String(data.refresh ?? data.refreshToken ?? ""),
        twitchUsername: String(data.twitch_name ?? data.twitchUsername ?? data.username ?? ""),
        hasError: Boolean(errors),
        errors
      };
    }
    publishState(key) {
      this.ensureTransport();
      if (this.authenticated) return this.writeState(key);
      const existing = this.deferredWrites.get(key);
      if (existing) return existing.promise;
      let send;
      let cancel;
      const promise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.deferredWrites.delete(key);
          reject(new Error("State update timed out waiting for authentication"));
        }, this.options.requestTimeoutMs ?? 3e4);
        send = () => {
          clearTimeout(timer);
          resolve(this.writeState(key));
        };
        cancel = (error) => {
          clearTimeout(timer);
          reject(error);
        };
      });
      this.deferredWrites.set(key, { promise, send, reject: cancel });
      return promise;
    }
    writeState(key) {
      if (key === "metadata") return this.request("set", "gameMetadata", this.state.metadata);
      if (key === "actions") {
        if (this.state.actions?.length) this.subscribeInBackground("*");
        return this.request("set", "gatewayActions", {
          actions: (this.state.actions ?? []).map((action) => this.toGatewayActionPayload(action))
        });
      }
      return this.request("patch", "state", {
        state_id: "channel",
        state: [{ op: "add", path: "/game/text/game_data", value: this.state.texts }]
      });
    }
    subscribeInBackground(sku) {
      if (!this.subscriptions.has(sku)) {
        void this.subscribeToTransactions(sku).catch(() => this.logger.warn("Hypeline subscription failed"));
      }
    }
    requireAuthentication() {
      if (!this.authenticated || this.signingOut || this.disposed) throw new Error("Sign in to Hypeline first");
    }
    updateAction(id, change) {
      this.requireAuthentication();
      this.findAction(id);
      return this.request("set", "gatewayActionState", { id, ...change });
    }
    setActionState(id, state) {
      return this.updateAction(id, { state: this.toGatewayActionState(state) });
    }
    findAction(id) {
      const action = this.state.actions?.find((entry) => entry.id === id);
      if (!action) {
        throw new Error(`Unknown Gateway action "${id}"`);
      }
      return action;
    }
    toGatewayActionPayload(action) {
      return {
        ...action,
        category: this.toGatewayActionCategory(action.category),
        state: this.toGatewayActionState(action.state)
      };
    }
    toGatewayActionCategory(category) {
      switch (category) {
        case 1 /* Hinder */:
          return "hinder";
        case 2 /* Help */:
          return "help";
        case 0 /* Neutral */:
        default:
          return "neutral";
      }
    }
    toGatewayActionState(state) {
      switch (state) {
        case 1 /* Available */:
          return "available";
        case 2 /* Hidden */:
          return "hidden";
        case 0 /* Unavailable */:
        default:
          return "unavailable";
      }
    }
    emitPollUpdate(update) {
      if (this.currentPoll?.id === update.pollId) notifyListener(this.currentPoll.onPollUpdate, update, this.listenerError);
      this.emitter.emit("pollUpdate", update);
    }
    emitTransaction(data) {
      const raw = data ?? {};
      const bits = {
        transactionId: String(raw.id ?? raw.transaction_id ?? ""),
        sku: String(raw.sku ?? ""),
        bits: Number(raw.cost ?? raw.bits ?? 0),
        userId: String(raw.userId ?? raw.user_id ?? ""),
        username: String(raw.username ?? raw.displayName ?? "")
      };
      if (!bits.transactionId || this.recentTransactions.has(bits.transactionId)) return;
      this.recentTransactions.add(bits.transactionId);
      if (this.recentTransactions.size > 1024) {
        this.recentTransactions.delete(this.recentTransactions.values().next().value);
      }
      this.emitter.emit("bitsUsed", bits);
      const actionId = String(raw.action_id ?? raw.actionId ?? raw.sku ?? "");
      if (actionId && this.state.actions?.some((action) => action.id === actionId)) {
        const used = {
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
    ensureTransport() {
      if (this.disposed || this.signingOut) throw new Error("Hypeline client is closed");
      if (!this.transport) {
        this.connect();
      }
    }
    clearPollTimer() {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
    }
    rejectPendingRequests(error) {
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.cancelQueued?.();
        this.pending.delete(id);
        pending.reject(error);
      }
    }
  };
  function diagnosticEnvelope(envelope, authentication) {
    const data = envelope.data;
    if (authentication || data && typeof data === "object" && ["pin", "jwt", "refresh", "refreshToken"].some((key) => key in data)) {
      return {
        action: actionOf(envelope),
        params: { request_id: requestIdOf(envelope), target: targetOf(envelope) },
        errors: envelope.errors?.map(({ status }) => ({ status }))
      };
    }
    return envelope;
  }

  // src/ui.ts
  function createAuthWidget(container, client, options = {}) {
    const root = document.createElement("section");
    root.className = options.className ?? "muxy-gateway-auth";
    root.innerHTML = `
    <form>
      <strong>${escapeHtml(options.title ?? "Hypeline")}</strong>
      <input name="pin" autocomplete="one-time-code" maxlength="6" placeholder="PIN" />
      <button type="submit">Authenticate</button>
      <button type="button" data-role="disconnect">Disconnect</button>
      <a href="${escapeAttribute(options.extensionUrl ?? "https://dashboard.twitch.tv/extensions/i575hs2x9lb3u8hqujtezit03w1740")}" target="_blank" rel="noreferrer">Get extension</a>
      <p data-role="status"></p>
    </form>
  `;
    injectBaseStyles();
    container.append(root);
    const form = root.querySelector("form");
    const input = root.querySelector("input");
    const status = root.querySelector('[data-role="status"]');
    const disconnect = root.querySelector('[data-role="disconnect"]');
    const onSubmit = (event) => {
      event.preventDefault();
      status.textContent = "Authenticating...";
      const pin = input.value;
      input.value = "";
      void client.authenticateWithPin(pin).then((response) => {
        status.textContent = response.hasError ? "Authentication failed" : "Authenticated";
      }).catch(() => {
        status.textContent = "Connection failed. Check your code and try again.";
      });
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
  function createNotificationHistory(container, client, options = {}) {
    const root = document.createElement("ol");
    root.className = options.className ?? "muxy-gateway-notifications";
    container.append(root);
    injectBaseStyles();
    const clearTimeMs = options.clearTimeMs ?? 8e3;
    const maxEntries = options.maxEntries ?? 4;
    const auto = options.autoAddActionMessages ?? true;
    const template = options.messageTemplate ?? "{Username} just bought {ActionID}";
    let clearTimer = null;
    const add = (message) => {
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
  function createPollingWidget(container, client, options = {}) {
    const root = document.createElement("section");
    root.className = options.className ?? "muxy-gateway-poll";
    root.hidden = true;
    container.append(root);
    injectBaseStyles();
    let hideTimer = null;
    const render = (update) => {
      const total = update.count || 1;
      root.hidden = false;
      root.replaceChildren();
      const list = document.createElement("ol");
      update.results.forEach((votes, index) => {
        const item = document.createElement("li");
        item.className = update.isFinal && update.winner === index ? "is-winner" : "";
        const percent = Math.round(votes / total * 100);
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
        }, options.winnerPauseMs ?? 3e3);
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
  function formatActionMessage(template, used) {
    const values = {
      TransactionID: used.transactionId,
      ActionID: used.actionId,
      Cost: String(used.cost),
      UserID: used.userId,
      Username: used.username
    };
    return template.replace(/\{(.+?)\}/g, (_, key) => values[key] ?? "");
  }
  var stylesInjected = false;
  function injectBaseStyles() {
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
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => {
      const escapes = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return escapes[char] ?? char;
    });
  }
  function escapeAttribute(value) {
    return escapeHtml(value);
  }
  return __toCommonJS(index_exports);
})();
var MuxyGatewayHTML5 = HypelineHTML5;
//# sourceMappingURL=index.global.js.map