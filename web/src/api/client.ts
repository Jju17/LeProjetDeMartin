import type { ETFResponse } from "../types/etf";
import type { FSMAResponse } from "../types/fsma";

const API_BASE = "https://us-central1-leprojetdemartin.cloudfunctions.net";

export async function fetchETFs(): Promise<ETFResponse> {
  const res = await fetch(`${API_BASE}/getETFs`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchFSMA(): Promise<FSMAResponse> {
  const res = await fetch(`${API_BASE}/getFSMA`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
