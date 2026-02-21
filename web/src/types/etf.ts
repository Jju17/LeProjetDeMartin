export interface ETF {
  name: string;
  isin: string;
  ticker: string;
  index: string;
  type: "accumulating" | "distributing";
  ter: number;
  fundSize: string;
  domicile: string;
  provider: string;
  currency: string;
  replication: string;
  latestQuote?: number;
  quoteDate?: string;
  fsmaCode?: string;
}

export interface ETFResponse {
  etfs: ETF[];
  count: number;
}

export type ETFTypeFilter = "Tous" | "Capitalisant" | "Distribuant";
export type FSMAFilter = "Tous" | "FSMA" | "Hors FSMA";

export type ETFSortKey =
  | "name"
  | "fundSizeDesc"
  | "fundSizeAsc"
  | "terAsc"
  | "terDesc"
  | "domicile"
  | "providerFirst"
  | "providerLast";

export function parseFundSize(str: string): number {
  if (!str) return 0;
  const parts = str.trim().split(/\s+/);
  if (parts.length < 2) return 0;
  const value = parseFloat(parts[0]);
  if (isNaN(value)) return 0;
  const unit = parts[1].toLowerCase();
  if (unit === "mrd") return value * 1000;
  if (unit === "m") return value;
  return value;
}
