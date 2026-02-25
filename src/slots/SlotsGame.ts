import type { FireballClient } from "../fireball/FireballClient";
import type { SpinResult } from "./types";
import type { ServerSpinResponse } from "./serverTypes";

/**
 * Thin wrapper around FireballClient for the Slots game.
 *
 * Requires FireballClient to already be connected and authorized.
 *
 * @example
 * const client = new FireballClient(config);
 * await client.connect();
 * await client.authorize();
 *
 * const game = new SlotsGame(client);
 * const result = await game.spin(5);
 * console.log(result.isWon, result.winAmount);
 */
export class SlotsGame {
  private readonly client: FireballClient;

  constructor(client: FireballClient) {
    this.client = client;
  }

  /**
   * Sends a spin request.
   *
   * @param betAmount - Whole unit bet (e.g. 5 for $5). The currency multiplier
   *   from authorize() is applied automatically.
   */
  async spin(betAmount: number): Promise<SpinResult> {
    const raw = await this.client.send<ServerSpinResponse>("spin", {
      Amount: betAmount * this.client.session.multiplier,
    });

    // Newtonsoft.Json emits Dictionary<int,int> with string keys — convert back.
    const symbols: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw.Symbols ?? {})) {
      symbols[Number(k)] = v;
    }

    return {
      symbols,
      winAmount: raw.WinAmount,
      balance: raw.Balance,
      isWon: raw.IsWon,
      currency: raw.Currency,
      gameType: raw.GameType,
    };
  }
}
