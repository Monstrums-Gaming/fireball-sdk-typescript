import type { FireballClientConfig } from "./types";

/**
 * Mutable session state populated in stages:
 *   - Static fields    — set from config in constructor
 *   - connectionId     — set after connect()
 *   - playerId etc.    — set after authorize()
 */
export interface Session {
  // ── From config ───────────────────────────────────────────────────────────
  operatorId: string;
  gameId: string;
  operatorPlayerId: string;
  token: string;
  environment: string;
  gameMode: string;
  currency: string;
  language: string;
  country: string;
  gender: string;
  extra: Record<string, string>;
  // ── Set after connect() ───────────────────────────────────────────────────
  connectionId: string;
  connectionToken: string;
  // ── Set after authorize() ─────────────────────────────────────────────────
  playerId: string;
  gameSession: string;
  operatorPlayerSession: string;
  multiplier: number;
}

export function buildSession(config: FireballClientConfig): Session {
  return {
    operatorId: config.operatorId,
    gameId: config.gameId,
    operatorPlayerId: config.operatorPlayerId,
    token: config.token,
    environment: config.environment ?? "development",
    gameMode: config.gameMode ?? "fun",
    currency: config.currency ?? "USD",
    language: config.language ?? "en",
    country: config.country ?? "",
    gender: config.gender ?? "",
    extra: { ...config.extra, operatorPlayerId: config.operatorPlayerId },
    connectionId: "",
    connectionToken: "",
    playerId: "",
    gameSession: "",
    operatorPlayerSession: "",
    multiplier: 1,
  };
}
