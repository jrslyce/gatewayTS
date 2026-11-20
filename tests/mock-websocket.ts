import type { HypecadeClient } from "../src";
import type { WebSocketLike } from "../src/types";

export class MockWebSocket implements WebSocketLike {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  readonly sent: string[] = [];
  readyState = MockWebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.(new Event("open")));
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new Event("close") as CloseEvent);
  }

  receive(data: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

export function lastSocket(): MockWebSocket {
  const socket = MockWebSocket.instances.at(-1);
  if (!socket) {
    throw new Error("No mock socket exists");
  }
  return socket;
}

export function sentAt(index: number): unknown {
  const message = lastSocket().sent[index];
  if (!message) {
    throw new Error(`No sent message at index ${index}`);
  }
  return JSON.parse(message);
}

export function replyToSent(index: number, data: unknown = { ok: true }): void {
  const request = JSON.parse(lastSocket().sent[index]!);
  lastSocket().receive({ meta: { request_id: request.params.request_id, action: request.action }, data });
}

export async function signIn(client: HypecadeClient): Promise<void> {
  const login = client.authenticateWithPin("ABC123");
  replyToSent(lastSocket().sent.length - 1, { jwt: "test-jwt", refresh: "test-refresh", username: "Streamer" });
  await login;
  lastSocket().sent.length = 0;
}
