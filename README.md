# Fireball TypeScript Client

TypeScript client for the [Fireball](https://cloud.fireballserver.com) gaming platform, ported from the Unity SDK (`Assets/Fireball/`).

The SDK is split into two layers: a **reusable Fireball transport layer** and **game-specific implementations**. Any game (Chicken, Mines, Crash, etc.) can be built on top of `FireballClient` without touching the SDK.

## How it works

The Fireball platform uses a **hybrid transport**:

- **HTTP POST** → `https://cloud.fireballserver.com/router` — sends requests
- **SignalR WebSocket** ← `https://cloud.fireballserver.com/messages/messages` — receives responses

Every request carries a unique `ActionId`. The WebSocket listener matches incoming responses back to their originating request using that ID.

---

## Project structure

```
js-client/
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
│   └── chicken/                Chicken game implementation
│       ├── types.ts            ChickenMode, ChickenGameState, MoveResult, etc.
│       ├── serverTypes.ts      Internal Chicken-specific server response shapes
│       ├── ChickenGame.ts      startRound / move / cashOut (tracks step + round state)
│       └── index.ts            Chicken barrel export
│
├── index.ts                    Root barrel — exports SDK + all games
├── example.ts                  Runnable usage example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Setup

```bash
cd js-client
npm install
```

---

## Running the example

Fill in your credentials in `example.ts`:

```ts
const client = new FireballClient({
  operatorId:       "your-operator-id",
  gameId:           "your-game-id",
  operatorPlayerId: "player-123",
  token:            "your-player-auth-token",
  environment:      "development",
  gameMode:         "fun",
  currency:         "USD",
});
```

> The `operatorId` and `gameId` can be found in the Unity project at
> `Assets/Scenes/ChickenGameFireballSettings.asset`.

Then run:

```bash
npm run example
```

---

## Usage

### 1. Connect and authorize

```ts
import { FireballClient, ChickenGame } from "./index";

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

### 3. Play a round

```ts
const game = new ChickenGame(client);

// Start a $5 round on easy mode
const start = await game.startRound(5, "easy");

// Make moves — step is tracked internally, no need to pass it
const move = await game.move();

if (move.popped) {
  console.log("Popped! Round lost.");
} else {
  console.log(`Safe — multiplier: ${move.currentMultiplier}x`);

  // Cash out at the current multiplier
  const cashout = await game.cashOut();
  console.log(`Won: ${cashout.winAmount / 100} ${currency}`);
}

await client.disconnect();
```

### 4. Error handling

All methods reject with a `FireballError` on failure:

```ts
import type { FireballError } from "./index";

try {
  await game.startRound(5, "easy");
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

### `ChickenGame`

| Method / Property | Description |
|---|---|
| `startRound(betAmount, mode, cheat?)` | Starts a new round. `betAmount` is in whole units (e.g. `5` for $5). |
| `move()` | Makes the next move. Step is tracked internally. |
| `cashOut()` | Cashes out the active round at the current multiplier. |
| `inRound` | `true` while a round is active. |
| `currentStep` | The current step number tracked client-side. |

### Game modes

| Value | Description |
|---|---|
| `"easy"` | Low pop chance per step |
| `"medium"` | Medium pop chance per step |
| `"hard"` | High pop chance per step |
| `"daredevil"` | Maximum pop chance per step |

### Currency note

All money values returned by the server (`balance`, `winAmount`, `betAmount`) are in the **smallest currency unit** (cents for USD). Divide by 100 to display as dollars.

The `betAmount` passed to `startRound()` is in **whole units** — the client multiplies by `session.multiplier` (set from the auth response) automatically before sending to the server.

---

## Scripts

```bash
npm run example   # run the example directly with tsx (no compile step)
npm run build     # compile to dist/ via tsc
npm run dev       # watch mode — recompile on save
npx tsc --noEmit  # type-check only
```
