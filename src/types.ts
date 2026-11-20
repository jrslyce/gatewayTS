export type Stage = "production" | "staging" | "sandbox";

export const GATEWAY_EXTENSION_CLIENT_ID = "i575hs2x9lb3u8hqujtezit03w1740";
export const DEFAULT_PRODUCTION_ENDPOINT =
  "wss://gamelink.muxy.io/0.2.0/gateway-unity/0.1.0/i575hs2x9lb3u8hqujtezit03w1740";
export const DEFAULT_STAGING_ENDPOINT = DEFAULT_PRODUCTION_ENDPOINT.replace("gamelink.muxy.io", "gamelink.staging.muxy.io");
/** @deprecated Sandbox is retired. Specify a custom endpoint for legacy fixtures. */
export const DEFAULT_SANDBOX_ENDPOINT =
  "wss://gamelink.sandbox.muxy.io/0.2.0/gateway-unity/0.1.0/i575hs2x9lb3u8hqujtezit03w1740";

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface HypecadeClientOptions {
  gameId: string;
  stage?: Stage;
  autoConnect?: boolean;
  endpoint?: string | ((stage: Stage, client: HypecadeClientOptions) => string);
  storage?: StorageAdapter;
  storageKey?: string;
  rememberSession?: boolean;
  websocket?: WebSocketConstructor;
  reconnect?: false | ReconnectOptions;
  requestTimeoutMs?: number;
  maxQueuedMessages?: number;
  logger?: Pick<Console, "debug" | "info" | "warn" | "error">;
}

/** @deprecated Use HypecadeClientOptions. */
export type GatewayClientOptions = HypecadeClientOptions;

export interface ReconnectOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
}

export interface WebSocketLike {
  readonly readyState: number;
  readonly bufferedAmount?: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  close(code?: number, reason?: string): void;
  send(data: string): void;
}

export interface WebSocketConstructor {
  readonly OPEN: number;
  readonly CLOSED: number;
  new (url: string): WebSocketLike;
}

export interface AuthenticationResponse {
  jwt: string;
  refreshToken: string;
  twitchUsername: string;
  hasError: boolean;
  errors?: GatewayError[];
}

export interface GameMetadata {
  name: string;
  logo?: string;
  theme?: string;
}

export interface GameText {
  label: string;
  value: string;
  icon?: string;
}

export enum GameActionCategory {
  Neutral = 0,
  Hinder = 1,
  Help = 2
}

export enum GameActionState {
  Unavailable = 0,
  Available = 1,
  Hidden = 2
}

export interface GameAction {
  id: string;
  category?: GameActionCategory;
  state?: GameActionState;
  impact: number;
  name: string;
  description: string;
  icon?: string;
  count?: number;
  onGameActionUsed?: (used: GameActionUsed) => void;
}

export const InfiniteCount = 0xffff;

export enum PollLocation {
  Default = 0
}

export enum PollMode {
  Chaos = 0,
  Order = 1
}

export interface PollConfiguration {
  id?: string;
  prompt: string;
  location?: PollLocation;
  mode?: PollMode;
  options: string[];
  durationInSeconds?: number;
  onPollUpdate?: (update: PollUpdate) => void;
}

export interface PollUpdate {
  pollId: string;
  winner: number;
  winningVoteCount: number;
  results: number[];
  count: number;
  mean: number;
  isFinal: boolean;
}

export interface BitsUsed {
  transactionId: string;
  sku: string;
  bits: number;
  userId: string;
  username: string;
}

export interface GameActionUsed {
  transactionId: string;
  actionId: string;
  cost: number;
  userId: string;
  username: string;
  raw?: unknown;
}

export interface GatewayError {
  status?: number;
  title?: string;
  detail?: string;
}

export interface GatewayEnvelope<TData = unknown> {
  action?: string;
  params?: {
    request_id?: number;
    target?: string;
    [key: string]: unknown;
  };
  meta?: {
    request_id?: number;
    action?: string;
    target?: string;
    timestamp?: number;
    [key: string]: unknown;
  };
  data?: TData;
  errors?: GatewayError[];
}

export type GatewayEventMap = {
  connect: Event;
  disconnect: CloseEvent | Event;
  error: Event | GatewayError[];
  debug: unknown;
  authentication: AuthenticationResponse;
  actionUsed: GameActionUsed;
  bitsUsed: BitsUsed;
  pollUpdate: PollUpdate;
  message: GatewayEnvelope;
  request: GatewayEnvelope;
};

export type GatewayEventName = keyof GatewayEventMap;
export type GatewayListener<T> = (event: T) => void;
