// ── Fireball SDK ──────────────────────────────────────────────────────────────
export type {
  FireballClientConfig,
  GameMode,
  Environment,
  FireballError,
  AuthResult,
  BalanceResult,
} from "./src/fireball/types";

export { FireballClient } from "./src/fireball/FireballClient";

// ── Slots Game ────────────────────────────────────────────────────────────────
export type { SpinResult } from "./src/slots/types";

export { SlotsGame } from "./src/slots/SlotsGame";
