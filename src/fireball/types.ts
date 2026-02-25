// ─── Config ───────────────────────────────────────────────────────────────────

export type GameMode = "fun" | "money" | "coins";
export type Environment = "development" | "staging" | "production";

export interface FireballClientConfig {
  operatorId: string;
  gameId: string;
  operatorPlayerId: string;
  /** Player auth token */
  token: string;
  environment?: Environment;
  gameMode?: GameMode;
  currency?: string;
  language?: string;
  country?: string;
  gender?: string;
  extra?: Record<string, string>;
  /** Request timeout ms (default: 15000) */
  timeoutMs?: number;
  /** Enable verbose request/response logging (default: false) */
  debug?: boolean;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export interface FireballError {
  name: string;
  reason: string;
  code: number;
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface AuthResult {
  balance: number;
  multiplier: number;
  currency: string;
  gameSession: string;
  playerId: string;
}

export interface BalanceResult {
  balance: number;
  currency: string;
}
