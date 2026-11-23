// Radar model: score every pre-token protocol from snapshot figures only.
// Implied value = TVL * baseMultiple * growthMult * maturityMult * signalMult.
// The same function scores every row; no protocol name is special-cased.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: SnapshotProtocol[]; watchlist: string[]; }
export interface ModelConstants {
  base_multiple: number; growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number; unknown_age_days: number;
  signal_weight: number;
}
export const MODEL: ModelConstants = {
  base_multiple: 0.24, growth_weight: 0.45, growth_floor: -60, growth_cap: 140,
  maturity_floor: 0.55, maturity_range: 0.45, maturity_days: 1095, unknown_age_days: 365,
  signal_weight: 0.18,
};
export const MODEL_VERSION = 'radar-v2-signal';
export const EARLY_ROWS = 220;
export const LIVE_ROWS = 30;

export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null; token_status: 'pre-token'; age_days: number | null;
  implied_value_usd: number;
  model: { base_multiple: number; growth_pct: number; growth_multiplier: number; maturity_multiplier: number; signal_multiplier: number; age_days: number | null };
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  age_days: number | null; implied_value_usd: number; growth_multiplier: number; maturity_multiplier: number; signal_multiplier: number;
}
export interface LiveRow { slug: string; name: string; category: string | null; chains: string[]; tvl_usd: number; mcap_usd: number | null; change_7d: number | null; }
export interface RadarData {
  as_of: string; source: string; floor_usd: number; model: ModelConstants; model_version: string;
  watchlist_size: number; board_size: number; early_size: number; live_size: number; rows: RadarRow[]; live: LiveRow[];
}
export class SnapshotError extends Error { constructor(m: string) { super(m); this.name = 'SnapshotError'; } }

const DAY_MS = 86400000;
const finite = (v: unknown, fb: number) => typeof v === 'number' && Number.isFinite(v) ? v : fb;
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
export function isPreToken(p: SnapshotProtocol): boolean { return p.mcap_usd === null && p.gecko_id === null && p.symbol === null; }
export function isRankable(p: SnapshotProtocol): boolean { return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name); }

function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)); }
function signalMultiplier(p: SnapshotProtocol, age: number | null, model: ModelConstants): number {
  // Signal uses only snapshot fields: chain breadth, category maturity, and age window.
  // More chains = more integration surface; older pre-token with TVL = stronger launch signal.
  const chainN = Math.max(1, p.chains.length);
  const chainFactor = 1 + Math.min(chainN - 1, 6) * 0.03; // 1.00..1.18
  const a = age ?? model.unknown_age_days;
  const ageWindow = a < 60 ? 0.88 : a < 180 ? 0.98 : a < 730 ? 1.08 : 1.03; // sweet spot: proven but not stale
  const cat = (p.category ?? '').toLowerCase();
  const catBoost = /lend|dex|deriv|perp|yield|restak|staking|bridge/.test(cat) ? 1.04 : /rwa|cdp|stable/.test(cat) ? 1.02 : 1.0;
  return clamp(1 + (chainFactor * ageWindow * catBoost - 1) * model.signal_weight * 4, 0.85, 1.35);
}

export function impliedValue(p: SnapshotProtocol, asOf: string, model: ModelConstants) {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const signalMult = signalMultiplier(p, age, model);
  const implied = Math.max(1, Math.round(p.tvl_usd * model.base_multiple * growthMult * maturityMult * signalMult));
  return { implied, growthPct, growthMult, maturityMult, signalMult, age };
}

function chainOf(p: SnapshotProtocol) { return p.chains.length > 0 ? p.chains[0]! : 'its main chain'; }
function capitalFor(p: SnapshotProtocol) { return p.tvl_usd >= 5_000_000_000 ? 250 : p.tvl_usd >= 1_000_000_000 ? 150 : p.tvl_usd >= 100_000_000 ? 100 : 50; }
function holdDaysFor(age: number | null) { return age === null ? 30 : age < 180 ? 60 : age < 365 ? 45 : 30; }
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase(), n = p.name;
  if (/lend|cdp|collateral/.test(c)) return `Supply $${capital} of a stable asset to ${n} on ${chain} and keep the position open to record onchain lending activity.`;
  if (/dex|yield|farm/.test(c)) return `Provide $${capital} of liquidity in ${n}'s main pool on ${chain} and keep the LP position active.`;
  if (/bridge/.test(c)) return `Bridge $${capital} through ${n} to ${chain} and complete at least one follow-up transaction in the destination app.`;
  if (/staking|restak/.test(c)) return `Stake $${capital} worth of the chain asset through ${n} on ${chain} and hold the receipt position.`;
  if (/perp|deriv/.test(c)) return `Deposit $${capital} as margin on ${n} and place one small hedged trade to create protocol activity.`;
  if (/rwa/.test(c)) return `Deposit $${capital} into ${n}'s onchain yield product on ${chain} and hold through one reporting cycle.`;
  if (/prediction/.test(c)) return `Fund $${capital} on ${n} and place one small market position, keeping records of the wallet and dates.`;
  return `Deposit $${capital} into ${n} on ${chain}, use the core feature once, and keep the position open.`;
}
export function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = s.slice(0, 596) + '...';
  if (s.length < 20) s += ' Check the protocol page for current terms.';
  return s;
}
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(age);
  return [
    stepText(`Use a fresh wallet funded only for farming and keep the seed phrase offline before interacting with ${p.name}.`, 'under $3 gas for setup', '5 minutes'),
    stepText(actionFor(p, capital, chain), `$${capital} capital plus about $${capital >= 150 ? 8 : 4} gas`, '15 minutes'),
    stepText(`Repeat one qualifying action weekly on ${p.name} (deposit, swap, borrow, or vote) so wallet activity spans multiple snapshots.`, 'about $2 gas per week', '10 minutes weekly'),
    stepText(`Hold the position for at least ${hold} days and avoid withdrawing right before major protocol announcements.`, `$${capital} remains deployed`, `${hold} days`),
    stepText(`Track transactions in a simple log with wallet, chain, dates, and tx hashes so you can prove consistent activity if rewards appear.`, 'no extra capital', '5 minutes weekly'),
    stepText(`Check ${p.name}'s official docs and governance channels for points or token updates and only claim through links published by the protocol.`, 'no fee to check; never pay to claim', '10 minutes'),
  ];
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map(p => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) { const p = index.get(slug); if (p) chosen.set(slug, p); }
  const early = snapshot.protocols
    .filter(p => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);
  const scored = [...chosen.values()].map(p => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || a.p.slug.localeCompare(b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1, slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains,
    tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d, mcap_usd: s.p.mcap_usd, listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id, symbol: s.p.symbol, token_status: 'pre-token', age_days: s.age,
    implied_value_usd: s.implied,
    model: { base_multiple: model.base_multiple, growth_pct: s.growthPct, growth_multiplier: r4(s.growthMult), maturity_multiplier: r4(s.maturityMult), signal_multiplier: r4(s.signalMult), age_days: s.age },
    farm_steps: farmSteps(s.p, s.age),
  }));
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(p => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map(p => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}

function radarRow(r: BoardRow): RadarRow {
  return { rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d, mcap_usd: r.mcap_usd, listed_at: r.listed_at, age_days: r.age_days, implied_value_usd: r.implied_value_usd, growth_multiplier: r.model.growth_multiplier, maturity_multiplier: r.model.maturity_multiplier, signal_multiplier: r.model.signal_multiplier };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter(r => !snapshot.watchlist.includes(r.slug)).length;
  return { board, radar: { as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model, model_version: MODEL_VERSION, watchlist_size: snapshot.watchlist.length, board_size: board.length, early_size: early, live_size: live.length, rows: board.map(radarRow), live } };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot root must be object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('bad as_of');
  if (typeof o.source !== 'string') throw new SnapshotError('bad source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('bad floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('bad protocols');
  if (!Array.isArray(o.watchlist) || o.watchlist.some(s => typeof s !== 'string')) throw new SnapshotError('bad watchlist');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} bad`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`protocol ${i} missing fields`);
    return {
      slug: p.slug, name: p.name, category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    } as SnapshotProtocol;
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map(r => r.slug));
  const missing = snapshot.watchlist.filter(s => !slugs.has(s));
  if (missing.length) return `missing ${missing.length} watchlist slugs`;
  const ranks = board.map(r => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `bad rank ${i + 1}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `rank order broken at ${i + 1}`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'all implied values same';
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} bad step count`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} bad step length`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} bad implied`;
  }
  return null;
}

export function dataScript(radar: RadarData): string { return `window.RADAR=${JSON.stringify(radar)};\n`; }
