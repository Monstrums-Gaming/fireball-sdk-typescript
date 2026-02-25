import type { ServerBaseMessage } from "../fireball/serverTypes";

/**
 * Slots game server response shapes.
 * Internal — not exported from the public surface.
 */

export interface ServerSpinResponse extends ServerBaseMessage {
  GameType: string;
  /** Newtonsoft.Json serializes Dictionary<int,int> with string keys */
  Symbols: Record<string, number>;
  WinAmount: number;
  Balance: number;
  IsWon: boolean;
}
