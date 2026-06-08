import type { GatewayEnvelope, ReconnectOptions, WebSocketConstructor, WebSocketLike } from "./types";
import { parseEnvelope } from "./protocol";

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
}

export class BrowserTransport {
  private socket: WebSocketLike | null = null;
  private queue: string[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private readonly websocket: WebSocketConstructor;

  constructor(private options: TransportOptions) {
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
    this.intentionalClose = false;
    this.clearReconnectTimer();

    if (this.socket && this.socket.readyState !== this.websocket.CLOSED) {
      return;
    }

    const socket = new this.websocket(this.options.url);
    this.socket = socket;

    socket.onopen = (event) => {
      this.reconnectAttempt = 0;
      this.flush();
      this.options.onOpen(event);
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") {
        this.options.onError(new Event("Gateway message was not text"));
        return;
      }

      try {
        this.options.onMessage(parseEnvelope(event.data));
      } catch {
        this.options.onError(new Event("Gateway message could not be parsed"));
      }
    };

    socket.onerror = (event) => {
      this.options.onError(event);
    };

    socket.onclose = (event) => {
      this.options.onClose(event);
      if (!this.intentionalClose && this.options.reconnect !== false) {
        this.scheduleReconnect();
      }
    };
  }

  disconnect(code = 1000, reason = "going away"): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.socket?.close(code, reason);
    this.socket = null;
  }

  send(envelope: GatewayEnvelope): void {
    const message = JSON.stringify(envelope);
    if (!this.isOpen) {
      this.queue.push(message);
      return;
    }

    this.socket?.send(message);
  }

  private flush(): void {
    while (this.queue.length > 0 && this.isOpen) {
      const message = this.queue.shift();
      if (message) {
        this.socket?.send(message);
      }
    }
  }

  private scheduleReconnect(): void {
    const reconnect = { ...DEFAULT_RECONNECT, ...(this.options.reconnect || {}) };
    const baseDelay = Math.min(
      reconnect.maxDelayMs,
      reconnect.initialDelayMs * Math.pow(reconnect.factor, this.reconnectAttempt)
    );
    const delay = reconnect.jitter ? baseDelay * (0.75 + Math.random() * 0.5) : baseDelay;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.socket = null;
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
