import type { GatewayEnvelope, Stage } from "./types";
import { DEFAULT_PRODUCTION_ENDPOINT, DEFAULT_STAGING_ENDPOINT } from "./types";

const MAX_REQUEST_ID = 0xffff;

export class RequestIds {
  private nextValue = 1;

  next(): number {
    const value = this.nextValue;
    this.nextValue = this.nextValue >= MAX_REQUEST_ID - 1 ? 1 : this.nextValue + 1;
    return value;
  }
}

export function resolveEndpoint(
  stage: Stage,
  endpoint?: string | ((stage: Stage) => string)
): string {
  const override = typeof endpoint === "function" ? endpoint(stage) : endpoint;
  if (!override && stage === "sandbox") {
    throw new Error("The sandbox service is retired. Use production or specify a test endpoint.");
  }
  const address = override ?? (stage === "staging" ? DEFAULT_STAGING_ENDPOINT : DEFAULT_PRODUCTION_ENDPOINT);
  validateEndpoint(address);
  return address;
}

export function validateEndpoint(address: string): void {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error("Invalid Hypeline WebSocket endpoint");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
  if (url.username || url.password || url.hash ||
      !(url.protocol === "wss:" || (url.protocol === "ws:" && loopback))) {
    throw new Error("Use wss:// for remote endpoints or ws:// on loopback only");
  }
}

export function createRequest<TData>(
  action: string,
  requestId: number,
  target?: string,
  data?: TData
): GatewayEnvelope<TData> {
  const request: GatewayEnvelope<TData> = {
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

export function requestIdOf(envelope: GatewayEnvelope): number | undefined {
  return envelope.meta?.request_id ?? envelope.params?.request_id;
}

export function targetOf(envelope: GatewayEnvelope): string {
  return String(envelope.meta?.target ?? envelope.params?.target ?? "");
}

export function actionOf(envelope: GatewayEnvelope): string {
  return String(envelope.meta?.action ?? envelope.action ?? "");
}

export function parseEnvelope(input: string): GatewayEnvelope {
  const parsed = JSON.parse(input) as GatewayEnvelope;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gateway message was not an object");
  }

  return parsed;
}

export function isOk(envelope: GatewayEnvelope): boolean {
  return !envelope.errors?.length;
}
