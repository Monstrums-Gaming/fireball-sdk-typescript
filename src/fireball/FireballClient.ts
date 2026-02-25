import * as signalR from "@microsoft/signalr";
import { HUB_URL, ROUTER_URL, HUB_RECEIVE, HUB_ACKNOWLEDGE } from "./constants";
import type { FireballClientConfig, FireballError, AuthResult, BalanceResult } from "./types";
import type { ServerBaseMessage, ServerAuthResponse, ServerBalanceResponse, WsEnvelope } from "./serverTypes";
import { buildSession, type Session } from "./session";
import { generateUuid } from "./utils";

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: FireballError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class FireballClient {
  private hub: signalR.HubConnection | null = null;
  private _session: Session;
  private pending = new Map<string, PendingEntry>();
  private readonly timeoutMs: number;
  private readonly debug: boolean;

  constructor(config: FireballClientConfig) {
    this.timeoutMs = config.timeoutMs ?? 15_000;
    this.debug = config.debug ?? false;
    this._session = buildSession(config);
  }

  // ── Public state ──────────────────────────────────────────────────────────

  get isConnected(): boolean {
    return this.hub?.state === signalR.HubConnectionState.Connected;
  }

  /** Read-only snapshot of the current session. */
  get session(): Readonly<Session> {
    return this._session;
  }

  // ── Connection ────────────────────────────────────────────────────────────

  /**
   * Opens the SignalR WebSocket connection and captures the ConnectionId.
   * Must be called before authorize().
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    const connectionToken = generateUuid();
    this._session.connectionToken = connectionToken;

    const params = new URLSearchParams({
      EIO: "4",
      transport: "websocket",
      connectionToken,
      environment: this._session.environment,
      operatorId: this._session.operatorId,
      gameId: this._session.gameId,
    });

    // Step 1 — Negotiate manually to capture both connectionId and connectionToken.
    //
    // SignalR v1 negotiate returns two fields:
    //   connectionId    — used as ConnectionId in all router request bodies
    //   connectionToken — used as ?id= in the WebSocket URL
    // These are different values; we need both, which requires doing the
    // negotiate ourselves rather than letting @microsoft/signalr do it.
    const negotiateUrl = `${HUB_URL}/negotiate?${params}&negotiateVersion=1`;
    this.log("connect", `Negotiating at ${negotiateUrl}`);

    const negotiateRes = await fetch(negotiateUrl, { method: "POST" });
    if (!negotiateRes.ok) {
      throw new Error(`Negotiate failed: HTTP ${negotiateRes.status} ${await negotiateRes.text()}`);
    }

    const negotiateData = await negotiateRes.json() as {
      connectionId: string;
      connectionToken: string;
    };

    this.log("connect", `Negotiate response`, negotiateData);

    // The negotiate response has two IDs:
    //   connectionId    — (negotiate response field, server's internal ID)
    //   connectionToken — used as ?id= in the WebSocket URL
    //
    // The Fireball router routes responses using the custom connectionToken UUID
    // we sent as a query param to /negotiate. The server registers the Pub/Sub
    // topic under that value when the negotiate request is processed.
    // connectionToken → used as ?id= in the WebSocket URL (ASP.NET Core SignalR convention)
    // connectionId    → sent as ConnectionId in all router POST bodies so the server
    //                   can look up the Pub/Sub subscription and push the response back
    const wsId = negotiateData.connectionToken ?? negotiateData.connectionId;
    this._session.connectionId = negotiateData.connectionId ?? wsId;

    // Step 2 — Connect WebSocket using negotiate's connectionToken as ?id=.
    // skipNegotiation so the library doesn't negotiate a second time.
    const wsParams = new URLSearchParams(params);
    wsParams.set("id", wsId);
    const hubUrl = `${HUB_URL}?${wsParams}`;
    this.log("connect", `Connecting WebSocket to ${hubUrl}`);

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets,
      })
      .withAutomaticReconnect([500, 1000, 2000])
      .configureLogging(this.debug ? signalR.LogLevel.Debug : signalR.LogLevel.Warning)
      .build();

    this.hub.on(HUB_RECEIVE, (raw: string) => this.handleMessage(raw));

    this.hub.onreconnected(() => {
      this.log("reconnected", `Reconnected. connectionId=${this._session.connectionId}`);
    });

    await this.hub.start();
    this.log("connect", `Connected. connectionId=${this._session.connectionId} (wsId=${wsId})`);
  }

  /** Closes the connection and rejects all in-flight requests. */
  async disconnect(): Promise<void> {
    this.rejectAllPending("Connection closed");
    await this.hub?.stop();
    this.hub = null;
  }

  // ── Auth & balance ────────────────────────────────────────────────────────

  /**
   * Authenticates the player and stores session fields (GameSession, PlayerId,
   * Multiplier, Currency) for use in all subsequent requests.
   */
  async authorize(): Promise<AuthResult> {
    const raw = await this.send<ServerAuthResponse>("authenticate", {
      Token: this._session.token,
    });

    this._session.gameSession = raw.GameSession;
    this._session.playerId = raw.PlayerId;
    this._session.operatorPlayerId = raw.OperatorPlayerId;
    this._session.operatorPlayerSession = raw.OperatorPlayerSession;
    this._session.multiplier = raw.Multiplier ?? 1;
    this._session.currency = raw.Currency ?? this._session.currency;

    if (raw.Extra) {
      Object.assign(this._session.extra, raw.Extra);
    }

    return {
      balance: raw.Balance,
      multiplier: this._session.multiplier,
      currency: this._session.currency,
      gameSession: raw.GameSession,
      playerId: raw.PlayerId,
    };
  }

  async getBalance(): Promise<BalanceResult> {
    const raw = await this.send<ServerBalanceResponse>("balance", {});
    return {
      balance: raw.Balance,
      currency: raw.Currency ?? this._session.currency,
    };
  }

  // ── Generic send ──────────────────────────────────────────────────────────

  /**
   * Sends a named request to the Fireball router and waits for the matching
   * response over the SignalR WebSocket.
   *
   * Game implementations call this to communicate with their server-side logic.
   * All payload fields must be PascalCase to match C# Newtonsoft.Json defaults.
   *
   * @example
   * const result = await client.send<MyGameResponse>("my-game-action", {
   *   BetAmount: 500,
   *   Mode: "hard",
   * });
   */
  send<T extends ServerBaseMessage>(name: string, payload: Record<string, unknown>): Promise<T> {
    if (!this.isConnected) {
      return Promise.reject<T>({
        name: "error",
        reason: "Not connected — call connect() first",
        code: 0,
      } satisfies FireballError);
    }

    const actionId = generateUuid();

    const body: Record<string, unknown> = {
      Name: name,
      ActionId: actionId,
      MessageTimestamp: Date.now(),
      Environment: this._session.environment,
      OperatorId: this._session.operatorId,
      GameId: this._session.gameId,
      PlayerId: this._session.playerId,
      GameSession: this._session.gameSession,
      GameMode: this._session.gameMode,
      Currency: this._session.currency,
      ConnectionId: this._session.connectionId,
      OperatorPlayerId: this._session.operatorPlayerId,
      OperatorPlayerSession: this._session.operatorPlayerSession,
      Extra: this._session.extra,
      ...payload,
    };

    this.log("send →", `[${name}] actionId=${actionId}`, body);

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        const err: FireballError = {
          name: "timeout",
          reason: `Request "${name}" timed out after ${this.timeoutMs}ms`,
          code: 0,
        };
        console.error(`[Fireball] ${err.reason}`);
        reject(err);
      }, this.timeoutMs);

      this.pending.set(actionId, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });

      fetch(ROUTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      })
        .then(async (res) => {
          // Surface HTTP-level errors immediately rather than waiting for timeout
          if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            const entry = this.pending.get(actionId);
            if (entry) {
              clearTimeout(entry.timer);
              this.pending.delete(actionId);
              const err: FireballError = {
                name: "error",
                reason: `Router HTTP ${res.status}: ${text}`,
                code: res.status,
              };
              console.error(`[Fireball] ${err.reason}`);
              entry.reject(err);
            }
          } else {
            this.log("send ✓", `[${name}] router accepted (HTTP ${res.status})`);
          }
        })
        .catch((err: unknown) => {
          const entry = this.pending.get(actionId);
          if (entry) {
            clearTimeout(entry.timer);
            this.pending.delete(actionId);
            const ferr: FireballError = { name: "error", reason: String(err), code: 0 };
            console.error(`[Fireball] fetch failed for "${name}": ${ferr.reason}`);
            entry.reject(ferr);
          }
        });
    });
  }

  // ── WebSocket handler ─────────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let envelope: WsEnvelope;
    try {
      envelope = JSON.parse(raw) as WsEnvelope;
    } catch {
      console.error("[Fireball] Could not parse WS message:", raw);
      return;
    }

    // Always log incoming messages so we can see what the server actually sends
    console.log(
      `[Fireball] recv ← [${envelope.Message?.Name ?? "?"}]`,
      `actionId=${envelope.ActionId}`,
      `wsMessageId=${envelope.WsMessageId}`,
      JSON.stringify(envelope.Message, null, 2)
    );

    // Every received message must be acknowledged back to the server.
    if (envelope.WsMessageId) {
      this.hub?.send(HUB_ACKNOWLEDGE, envelope.WsMessageId).catch(() => {});
    }

    const { ActionId, Message } = envelope;
    const entry = this.pending.get(ActionId);
    if (!entry) {
      console.warn(
        `[Fireball] No pending request for actionId=${ActionId}.`,
        `Pending: [${[...this.pending.keys()].join(", ")}]`
      );
      return;
    }

    clearTimeout(entry.timer);
    this.pending.delete(ActionId);

    if (Message.Reason) {
      const err: FireballError = {
        name: Message.Name ?? "error",
        reason: Message.Reason,
        code: Message.Code ?? 0,
      };
      console.error(`[Fireball] Server error for "${Message.Name}": ${err.reason} (code: ${err.code})`);
      entry.reject(err);
    } else {
      entry.resolve(Message);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject({ name: "error", reason, code: 0 });
    }
    this.pending.clear();
  }

  // ── Logging ───────────────────────────────────────────────────────────────

  private log(label: string, message: string, data?: unknown): void {
    if (!this.debug) return;
    if (data !== undefined) {
      console.log(`[Fireball] ${label} ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[Fireball] ${label} ${message}`);
    }
  }
}
