import type { GatewayEnvelope, ReconnectOptions, WebSocketConstructor, WebSocketLike } from "./types";
import { parseEnvelope, validateEndpoint } from "./protocol";

const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const utf8 = new TextEncoder();

const DEFAULT_RECONNECT: Required<ReconnectOptions> = {
  initialDelayMs: 500,
  maxDelayMs: 30000,
  factor: 2,
  jitter: true
};

export interface TransportOptions {
  url: string;
  websocket?: WebSocketConstructor;
  reconnect?: false | ReconnectOptions;
  onOpen: (event: Event) => void;
  onClose: (event: CloseEvent | Event) => void;
  onError: (event: Event) => void;
  onMessage: (message: GatewayEnvelope) => void;
  maxQueuedMessages?: number;
}

export class BrowserTransport {
  private socket: WebSocketLike | null = null;
  private readonly queue = new Set<{ message: string }>();
  private stopped = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private readonly websocket: WebSocketConstructor;

  constructor(private options: TransportOptions) {
    validateEndpoint(options.url);
    const WebSocketImpl = options.websocket ?? globalThis.WebSocket;
    if (!WebSocketImpl) {
      throw new Error("No WebSocket implementation is available");
    }
    this.websocket = WebSocketImpl as WebSocketConstructor;
  }

  get isOpen(): boolean {
    return this.socket?.readyState === this.websocket.OPEN;
  }

  connect(): void {
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
      const data: unknown = event.data;
      if (typeof data !== "string" || data.length > MAX_MESSAGE_BYTES ||
          (data.length > MAX_MESSAGE_BYTES / 3 && utf8.encode(data).length > MAX_MESSAGE_BYTES)) {
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

  disconnect(code = 1000, reason = "going away"): void {
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

  send(envelope: GatewayEnvelope): (() => void) | undefined {
    if (this.stopped) throw new Error("Hypecade connection is closed");
    const message = JSON.stringify(envelope);
    if (!this.isOpen) {
      const maxQueuedMessages = this.options.maxQueuedMessages ?? 100;
      if (this.queue.size >= maxQueuedMessages) {
        throw new Error(`Gateway transport queue is full (limit ${maxQueuedMessages})`);
      }
      const entry = { message };
      this.queue.add(entry);
      return () => { this.queue.delete(entry); };
    }

    this.socket?.send(message);
    return undefined;
  }

  private flush(): void {
    for (const entry of this.queue) {
      if (!this.isOpen) break;
      this.queue.delete(entry);
      this.socket!.send(entry.message);
    }
  }

  async drain(timeoutMs: number): Promise<void> {
    const socket = this.socket;
    const deadline = Date.now() + timeoutMs;
    while (this.socket === socket && this.isOpen && socket?.bufferedAmount && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
  }

  private scheduleReconnect(): void {
    const reconnect = { ...DEFAULT_RECONNECT, ...(this.options.reconnect || {}) };
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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
