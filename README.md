# Fireball TypeScript SDK

TypeScript SDK for the [Fireball](https://cloud.fireballserver.com) gaming platform.

The SDK is split into two layers: a **reusable Fireball transport layer** and **game-specific implementations**. Any game (Slots, Mines, Crash, etc.) can be built on top of `FireballClient` without touching the core SDK.

## How it works

The Fireball platform uses a **hybrid transport**:

- **HTTP POST** → `https://cloud.fireballserver.com/router` — sends requests
- **SignalR WebSocket** ← `https://cloud.fireballserver.com/messages/messages` — receives responses

Every request carries a unique `ActionId`. The WebSocket listener matches incoming responses back to their originating request using that ID.

---

## Project structure

```
├── src/
│   ├── fireball/               Reusable SDK — game-agnostic transport layer
│   │   ├── constants.ts        Server URLs and SignalR hub method names
│   │   ├── types.ts            Public types: FireballClientConfig, FireballError, AuthResult, BalanceResult
│   │   ├── serverTypes.ts      Internal PascalCase server response shapes
│   │   ├── session.ts          Session interface and buildSession() factory
│   │   ├── utils.ts            UUID generation
│   │   ├── FireballClient.ts   Core client: connect / authorize / getBalance / send<T>
│   │   └── index.ts            SDK barrel export
│   │
│   └── slots/                  Slots game implementation
│       ├── types.ts            SpinResult
│       ├── serverTypes.ts      Internal Slots-specific server response shapes
│       ├── SlotsGame.ts        spin()
│       └── index.ts            Slots barrel export
│
├── Samples/
│   └── SlotsSample/index.ts    Runnable usage example
├── index.ts                    Root barrel — exports SDK + all games
├── package.json
├── tsconfig.json
└── README.md
```

---

## Setup

```bash
npm install
```

---

## Running the example

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Then run:

```bash
npm run example
```

---

## Usage

### 1. Connect and authorize

```ts
import { FireballClient } from "@jjavier/fireball-sdk";

const client = new FireballClient({
  operatorId:       "your-operator-id",
  gameId:           "your-game-id",
  operatorPlayerId: "player-123",
  token:            "your-auth-token",
  environment:      "development",
  gameMode:         "fun",
  currency:         "USD",
});

await client.connect();    // opens WebSocket, captures ConnectionId
await client.authorize();  // authenticates player, stores session + multiplier
```

### 2. Check balance

```ts
const { balance, currency } = await client.getBalance();
// balance is in smallest currency unit (cents for USD)
console.log(`Balance: ${balance / 100} ${currency}`);
```

### 3. Spin

```ts
import { SlotsGame } from "@jjavier/fireball-sdk/slots";

const game = new SlotsGame(client);
const result = await game.spin(5); // $5 bet

if (result.isWon) {
  console.log(`Won: ${result.winAmount / 100} ${result.currency}`);
} else {
  console.log("No win.");
}

await client.disconnect();
```

### 4. Error handling

All methods reject with a `FireballError` on failure:

```ts
import type { FireballError } from "@jjavier/fireball-sdk";

try {
  await game.spin(5);
} catch (err) {
  const e = err as FireballError;
  console.error(`[${e.name}] ${e.reason} (code: ${e.code})`);
}
```

Common error names: `"error"` (server/network), `"timeout"` (no response within `timeoutMs`).

---

## Adding a new game

Create a new folder under `src/` and use `client.send<T>()` to communicate with the server. The Fireball SDK knows nothing about your game — it just handles the transport.

```ts
// src/mines/MinesGame.ts
import type { FireballClient } from "../fireball/FireballClient";

export class MinesGame {
  constructor(private readonly client: FireballClient) {}

  async startRound(betAmount: number, mineCount: number) {
    return this.client.send<ServerMinesStartResponse>("mines-start", {
      BetAmount: betAmount * this.client.session.multiplier,
      MineCount: mineCount,
    });
  }
}
```

Then export it from `index.ts`:

```ts
export { MinesGame } from "./src/mines/MinesGame";
```

---

## API reference

### `FireballClient`

| Method / Property | Description |
|---|---|
| `connect()` | Opens the SignalR WebSocket connection. Must be called first. |
| `disconnect()` | Closes the connection and rejects all pending requests. |
| `authorize()` | Authenticates the player. Returns `AuthResult`. Stores session data internally. |
| `getBalance()` | Fetches the current balance. Returns `BalanceResult`. |
| `send<T>(name, payload)` | Generic send — used by game implementations to call their server-side logic. |
| `isConnected` | `true` if the WebSocket is currently connected. |
| `session` | Read-only snapshot of the current session state. |

### `SlotsGame`

| Method | Description |
|---|---|
| `spin(betAmount)` | Sends a spin request. `betAmount` is in whole units (e.g. `5` for $5). Returns `SpinResult`. |

### `SpinResult`

| Field | Type | Description |
|---|---|---|
| `symbols` | `Record<number, number>` | Maps slot position (0-based) to symbol index |
| `winAmount` | `number` | Amount won in smallest currency unit |
| `balance` | `number` | Player balance after spin |
| `isWon` | `boolean` | Whether the spin was a win |
| `currency` | `string` | Currency code |
| `gameType` | `string` | Game type identifier from server |

### Currency note

All money values returned by the server (`balance`, `winAmount`) are in the **smallest currency unit** (cents for USD). Divide by 100 to display as dollars.

The `betAmount` passed to `spin()` is in **whole units** — the client multiplies by `session.multiplier` (set from the auth response) automatically before sending to the server.

---

## Scripts

```bash
npm run example   # run the example directly with tsx (no compile step)
npm run build     # compile to dist/ via tsc
npm run dev       # watch mode — recompile on save
npx tsc --noEmit  # type-check only
```
