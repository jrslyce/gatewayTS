import type { GatewayEnvelope, Stage } from "./types";
import { DEFAULT_PRODUCTION_ENDPOINT, DEFAULT_SANDBOX_ENDPOINT } from "./types";

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
  if (typeof endpoint === "function") {
    return endpoint(stage);
  }

  if (endpoint) {
    return endpoint;
  }

  return stage === "sandbox" ? DEFAULT_SANDBOX_ENDPOINT : DEFAULT_PRODUCTION_ENDPOINT;
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

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gateway message was not an object");
  }

  return parsed;
}

export function isOk(envelope: GatewayEnvelope): boolean {
  return !envelope.errors?.length;
}
