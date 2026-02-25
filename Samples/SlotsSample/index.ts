/**
 * Slots Sample — Usage Example
 *
 * Demonstrates the full game flow using FireballClient + SlotsGame:
 *   connect → authorize → spin × N
 *
 * Copy .env.example to .env, fill in your credentials, then run:
 *   npm run example
 */

import "dotenv/config";
import { FireballClient, SlotsGame } from "../../index";
import type { FireballError, Environment, GameMode } from "../../index";

// ─── Config from .env ─────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

const client = new FireballClient({
  operatorId:       requireEnv("FIREBALL_OPERATOR_ID"),
  gameId:           requireEnv("FIREBALL_GAME_ID"),
  operatorPlayerId: requireEnv("FIREBALL_OPERATOR_PLAYER_ID"),
  token:            requireEnv("FIREBALL_TOKEN"),
  environment:      (process.env.FIREBALL_ENVIRONMENT ?? "development") as Environment,
  gameMode:         (process.env.FIREBALL_GAME_MODE ?? "fun") as GameMode,
  currency:         process.env.FIREBALL_CURRENCY ?? "USD",
  debug:            process.env.FIREBALL_DEBUG === "true",
});

const game = new SlotsGame(client);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── 1. Connect ─────────────────────────────────────────────────────────────
  console.log("Connecting...");
  await client.connect();
  console.log("Connected.");

  // ── 2. Authorize ───────────────────────────────────────────────────────────
  console.log("Authorizing...");
  const auth = await client.authorize();
  console.log(
    `Authorized — Player: ${auth.playerId} | ` +
    `Balance: ${formatMoney(auth.balance, auth.currency)} | ` +
    `Multiplier: ${auth.multiplier}x`
  );

  // ── 3. Check balance ───────────────────────────────────────────────────────
  const { balance, currency } = await client.getBalance();
  console.log(`Balance: ${formatMoney(balance, currency)}`);

  // ── 4. Spin a few times ────────────────────────────────────────────────────
  const BET_AMOUNT = 1;
  const SPINS = 3;

  for (let i = 1; i <= SPINS; i++) {
    console.log(`\nSpin ${i} — bet: ${formatMoney(BET_AMOUNT * 100, currency)}...`);
    const result = await game.spin(BET_AMOUNT);

    const symbolList = Object.entries(result.symbols)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, sym]) => sym)
      .join(" | ");

    if (result.isWon) {
      console.log(
        `WIN! Symbols: [ ${symbolList} ] | ` +
        `Won: ${formatMoney(result.winAmount, result.currency)} | ` +
        `Balance: ${formatMoney(result.balance, result.currency)}`
      );
    } else {
      console.log(
        `No win. Symbols: [ ${symbolList} ] | ` +
        `Balance: ${formatMoney(result.balance, result.currency)}`
      );
    }
  }

  await client.disconnect();
  console.log("\nDisconnected.");
}

// ─── Error handling ───────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  if (err && typeof err === "object" && "reason" in err) {
    const e = err as FireballError;
    console.error(`[${e.name}] ${e.reason} (code: ${e.code})`);
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
});
