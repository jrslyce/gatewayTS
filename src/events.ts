import type { GatewayEventMap, GatewayEventName, GatewayListener } from "./types";

// A game listener must not interrupt response handling or other listeners.
export function notifyListener<T>(listener: GatewayListener<T>, value: T, onError: () => void): void {
  try {
    const result: unknown = listener(value);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      void Promise.resolve(result).catch(onError);
    }
  } catch {
    onError();
  }
}

export class TypedEmitter {
  private listeners = new Map<GatewayEventName, Set<GatewayListener<unknown>>>();

  constructor(private readonly onError: () => void) {}

  on<Name extends GatewayEventName>(
    event: Name,
    listener: GatewayListener<GatewayEventMap[Name]>
  ): () => void {
    const bucket = this.listeners.get(event) ?? new Set<GatewayListener<unknown>>();
    bucket.add(listener as GatewayListener<unknown>);
    this.listeners.set(event, bucket);
    return () => this.off(event, listener);
  }

  off<Name extends GatewayEventName>(
    event: Name,
    listener: GatewayListener<GatewayEventMap[Name]>
  ): void {
    this.listeners.get(event)?.delete(listener as GatewayListener<unknown>);
  }

  emit<Name extends GatewayEventName>(event: Name, payload: GatewayEventMap[Name]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      notifyListener(listener, payload, this.onError);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
