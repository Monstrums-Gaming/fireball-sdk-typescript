export interface SpinResult {
  /** Maps slot position (0-based index) to symbol index */
  symbols: Record<number, number>;
  winAmount: number;
  balance: number;
  isWon: boolean;
  currency: string;
  gameType: string;
}
