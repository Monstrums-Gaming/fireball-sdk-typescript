/**
 * Generic Fireball server response shapes.
 *
 * The server serializes C# models with Newtonsoft.Json defaults (PascalCase).
 * These are internal — not exported from the public SDK surface.
 */

export interface ServerBaseMessage {
  Name: string;
  ActionId: string;
  MessageTimestamp: number;
  Environment: string;
  OperatorId: string;
  OperatorPlayerSession: string;
  OperatorPlayerId: string;
  GameId: string;
  PlayerId: string;
  GameSession: string;
  GameMode: string;
  Currency: string;
  ConnectionId: string;
  Extra: Record<string, string>;
  Variant: number;
  /** Non-empty string signals an error response */
  Reason?: string;
  Code?: number;
}

export interface ServerAuthResponse extends ServerBaseMessage {
  Balance: number;
  Multiplier: number | null;
}

export interface ServerBalanceResponse extends ServerBaseMessage {
  Balance: number;
}

/** WebSocket envelope wrapping every inbound server message */
export interface WsEnvelope {
  ActionId: string;
  WsMessageId: string;
  Message: ServerBaseMessage;
}
