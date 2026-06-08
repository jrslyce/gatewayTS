import type { GatewayEventMap, GatewayEventName, GatewayListener } from "./types";

export class TypedEmitter {
  private listeners = new Map<GatewayEventName, Set<GatewayListener<unknown>>>();

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
      listener(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
