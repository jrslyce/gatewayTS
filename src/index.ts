export { HypecadeClient, GatewayClient } from "./client";
export {
  createAuthWidget,
  createNotificationHistory,
  createPollingWidget,
  type AuthWidgetOptions,
  type NotificationHistoryOptions,
  type PollingWidgetOptions
} from "./ui";
export {
  DEFAULT_PRODUCTION_ENDPOINT,
  DEFAULT_SANDBOX_ENDPOINT,
  DEFAULT_STAGING_ENDPOINT,
  GATEWAY_EXTENSION_CLIENT_ID,
  GameActionCategory,
  GameActionState,
  InfiniteCount,
  PollLocation,
  PollMode,
  type AuthenticationResponse,
  type BitsUsed,
  type GameAction,
  type GameActionUsed,
  type GameMetadata,
  type GameText,
  type HypecadeClientOptions,
  type GatewayClientOptions,
  type GatewayEnvelope as HypecadeEnvelope,
  type GatewayError as HypecadeError,
  type GatewayEnvelope,
  type GatewayError,
  type PollConfiguration,
  type PollUpdate,
  type Stage,
  type StorageAdapter
} from "./types";
