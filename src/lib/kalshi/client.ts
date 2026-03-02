import { clamp } from "@/lib/db/utils";

export interface KalshiMarketSnapshot {
  externalId: string;
  title: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  status: "open" | "closed" | "resolved";
  closeTime: number;
  source: "kalshi";
}

function normalizeBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) {
    return "";
  }

  try {
    const url = new URL(trimmed);

    // UX convenience: users often paste the demo web host instead of the API host.
    if (url.hostname === "demo.kalshi.co") {
      url.hostname = "demo-api.kalshi.co";
    }

    if (!/\/trade-api\/v\d+/.test(url.pathname)) {
      url.pathname = "/trade-api/v2";
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

function buildCandidateBases(): string[] {
  const fromEnv = process.env.KALSHI_BASE_URL?.trim();
  const defaults = [
    "https://demo-api.kalshi.co/trade-api/v2",
    "https://api.elections.kalshi.com/trade-api/v2",
    "https://api.elections.kalshi.com",
    "https://trading-api.kalshi.com/trade-api/v2"
  ].map(normalizeBase);

  const candidates = fromEnv ? [normalizeBase(fromEnv), ...defaults] : defaults;
  return [...new Set(candidates.filter((value) => value.length > 0))];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      },
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
  }
}

function toEpoch(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw > 10_000_000_000 ? raw : raw * 1000;
  }

  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return n > 10_000_000_000 ? n : n * 1000;
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Date.now() + 1000 * 60 * 60 * 24 * 30;
}

function normalizeStatus(raw: unknown): "open" | "closed" | "resolved" {
  const normalized = String(raw ?? "open").toLowerCase();
  if (normalized.includes("resolve")) {
    return "resolved";
  }
  if (normalized.includes("clos")) {
    return "closed";
  }
  return "open";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumberish(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const direct = Number(trimmed);
    if (Number.isFinite(direct)) {
      return direct;
    }

    const compact = trimmed.replace(/,/g, "").toLowerCase();
    const magnitude = compact.match(/^(-?\d+(?:\.\d+)?)([kmb])$/i);
    if (magnitude) {
      const base = Number(magnitude[1]);
      const suffix = magnitude[2].toLowerCase();
      const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : 1_000_000_000;
      if (Number.isFinite(base)) {
        return base * multiplier;
      }
    }

    const normalized = trimmed.replace(/[$,%\s]/g, "").replace(/,/g, "");
    const cleaned = Number(normalized);
    if (Number.isFinite(cleaned)) {
      return cleaned;
    }

    const numericOnly = trimmed.replace(/[^0-9.-]/g, "");
    if (numericOnly && numericOnly !== "." && numericOnly !== "-" && numericOnly !== "-.") {
      const extracted = Number(numericOnly);
      if (Number.isFinite(extracted)) {
        return extracted;
      }
    }
  }

  return null;
}

function coerceNumber(input: unknown, fallback: number): number {
  const num = parseNumberish(input);
  return num === null ? fallback : num;
}

function normalizePrice(raw: unknown): number | null {
  const value = parseNumberish(raw);
  if (value === null) {
    return null;
  }

  // Some payloads encode prices in dollars [0,1], others in cents [0,100].
  if (value >= 0 && value <= 1) {
    return value * 100;
  }
  return value;
}

function pickPrice(...fields: unknown[]): number | null {
  for (const field of fields) {
    const normalized = normalizePrice(field);
    if (normalized !== null) {
      return normalized;
    }
  }
  return null;
}

function deriveVolume(entry: Record<string, unknown>): number {
  const candidates = [
    entry.volume,
    entry.event_volume,
    entry.event_volume_24h,
    entry.event_volume_7d,
    entry.total_event_volume,
    entry.total_event_volume_usd,
    entry.volume_1d,
    entry.volume_24h,
    entry.volume_7d,
    entry.dollar_volume,
    entry.volume_dollars,
    entry.dollar_volume_7d,
    entry.notional_volume,
    entry.dollar_volume_24h,
    entry.open_interest_dollars,
    entry.total_volume,
    entry.total_volume_usd,
    entry.volume_usd,
    entry.yes_volume,
    entry.no_volume,
    entry.open_interest,
    entry.liquidity
  ];

  let best = 0;
  for (const candidate of candidates) {
    const n = coerceNumber(candidate, 0);
    if (n > best) {
      best = n;
    }
  }

  if (best > 0) {
    return Math.max(0, best);
  }

  // Event payloads can nest market rows where each row carries volume.
  const nestedCollections = [entry.markets, entry.contracts, entry.outcomes, entry.participants];
  let nestedSum = 0;
  for (const collection of nestedCollections) {
    if (!Array.isArray(collection)) {
      continue;
    }

    for (const item of collection) {
      if (!isRecord(item)) {
        continue;
      }
      const nestedVolume = coerceNumber(
        item.volume ??
          item.volume_24h ??
          item.volume_7d ??
          item.dollar_volume ??
          item.dollar_volume_24h ??
          item.notional_volume ??
          item.total_volume ??
          item.total_volume_usd,
        0
      );
      nestedSum += Math.max(0, nestedVolume);
    }
  }

  if (nestedSum > 0) {
    return nestedSum;
  }

  return Math.max(0, best);
}

function deriveYesPrice(entry: Record<string, unknown>): number {
  const directYes = pickPrice(
    entry.yes_price,
    entry.last_price_yes,
    entry.last_yes_price,
    entry.last_price,
    entry.mark_price
  );
  if (directYes !== null) {
    return directYes;
  }

  const yesBid = pickPrice(entry.yes_bid, entry.bid_yes, entry.best_bid_yes);
  const yesAsk = pickPrice(entry.yes_ask, entry.ask_yes, entry.best_ask_yes);
  if (yesBid !== null && yesAsk !== null) {
    return (yesBid + yesAsk) / 2;
  }
  if (yesAsk !== null) {
    return yesAsk;
  }
  if (yesBid !== null) {
    return yesBid;
  }

  const directNo = pickPrice(entry.no_price, entry.last_price_no, entry.last_no_price);
  if (directNo !== null) {
    return 100 - directNo;
  }

  const noBid = pickPrice(entry.no_bid, entry.bid_no, entry.best_bid_no);
  const noAsk = pickPrice(entry.no_ask, entry.ask_no, entry.best_ask_no);
  if (noBid !== null && noAsk !== null) {
    return 100 - (noBid + noAsk) / 2;
  }
  if (noAsk !== null) {
    return 100 - noAsk;
  }
  if (noBid !== null) {
    return 100 - noBid;
  }

  return 50;
}

function deriveEventYesPrice(entry: Record<string, unknown>): number {
  const direct = pickPrice(
    entry.probability_yes,
    entry.implied_probability_yes,
    entry.favorite_probability,
    entry.favorite_price
  );
  if (direct !== null) {
    return direct;
  }

  const containers = [entry.outcomes, entry.markets, entry.contracts, entry.participants, entry.choices];
  const prices: number[] = [];
  for (const container of containers) {
    if (!Array.isArray(container)) {
      continue;
    }

    for (const item of container) {
      if (!isRecord(item)) {
        continue;
      }

      const p = pickPrice(
        item.probability,
        item.price,
        item.last_price,
        item.mark_price,
        item.yes_price,
        item.last_price_yes,
        item.last_yes_price
      );

      if (p !== null) {
        prices.push(clamp(p, 0, 100));
        continue;
      }

      const noPrice = pickPrice(item.no_price, item.last_price_no, item.last_no_price);
      if (noPrice !== null) {
        prices.push(clamp(100 - noPrice, 0, 100));
      }
    }
  }

  if (prices.length > 0) {
    return Math.max(...prices);
  }

  return deriveYesPrice(entry);
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => isRecord(item));
}

function extractEntries(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return toRecordArray(payload);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const data = payload.data;
  const fromData = isRecord(data) ? data : {};

  const topLevel = [
    payload.events,
    payload.markets,
    payload.results,
    payload.items,
    payload.event_sets,
    data,
    fromData.events,
    fromData.markets,
    fromData.results,
    fromData.items,
    fromData.event_sets
  ];

  const rows = topLevel.flatMap((bucket) => toRecordArray(bucket));

  // Some payloads wrap entries inside groups/lists under different keys.
  const nested = rows.flatMap((row) =>
    toRecordArray(row.events ?? row.items ?? row.data ?? row.markets ?? row.contracts ?? row.outcomes)
  );
  if (nested.length > 0) {
    return [...rows, ...nested];
  }

  return rows;
}

function extractNextCursor(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const data = isRecord(payload.data) ? payload.data : {};
  const pagination = isRecord(payload.pagination) ? payload.pagination : {};
  const dataPagination = isRecord(data.pagination) ? data.pagination : {};

  const candidates: unknown[] = [
    payload.next_cursor,
    payload.nextCursor,
    payload.next_page_token,
    data.next_cursor,
    data.nextCursor,
    data.next_page_token,
    pagination.next_cursor,
    pagination.nextCursor,
    pagination.next_page_token,
    dataPagination.next_cursor,
    dataPagination.nextCursor,
    dataPagination.next_page_token,
    payload.cursor,
    data.cursor,
    pagination.cursor,
    dataPagination.cursor
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function buildKalshiUrls(base: string, limit: number): string[] {
  const events = new URL(`${base}/events/multivariate`);
  events.searchParams.set("status", "open");
  events.searchParams.set("limit", String(limit));

  const eventsFallback = new URL(`${base}/events/multivariate`);
  eventsFallback.searchParams.set("limit", String(limit));

  const eventsSimple = new URL(`${base}/events`);
  eventsSimple.searchParams.set("status", "open");
  eventsSimple.searchParams.set("limit", String(limit));

  const eventsSimpleFallback = new URL(`${base}/events`);
  eventsSimpleFallback.searchParams.set("limit", String(limit));

  const primary = new URL(`${base}/markets`);
  primary.searchParams.set("status", "open");
  primary.searchParams.set("limit", String(limit));
  primary.searchParams.set("mve_filter", "exclude");

  const multivariate = new URL(`${base}/markets`);
  multivariate.searchParams.set("status", "open");
  multivariate.searchParams.set("limit", String(limit));
  multivariate.searchParams.set("mve_filter", "only");

  const fallback = new URL(`${base}/markets`);
  fallback.searchParams.set("status", "open");
  fallback.searchParams.set("limit", String(limit));

  return [
    ...new Set([
      events.toString(),
      eventsFallback.toString(),
      eventsSimple.toString(),
      eventsSimpleFallback.toString(),
      primary.toString(),
      multivariate.toString(),
      fallback.toString()
    ])
  ];
}

function isMultiLegMarket(input: {
  externalId: string;
  title: string;
  category: string;
  seriesTicker: string;
}): boolean {
  const structural = `${input.externalId} ${input.category} ${input.seriesTicker}`.toUpperCase();
  if (/(CROSSCATEGORY|MULTIGAME|PARLAY|SAMEGAME|SGP)/.test(structural)) {
    return true;
  }

  const legsInTitle = (input.title.match(/\b(yes|no)\b/gi) ?? []).length;
  return input.title.includes(",") && legsInTitle >= 2;
}

export async function fetchKalshiMarkets(limit = 50): Promise<KalshiMarketSnapshot[]> {
  const bases = buildCandidateBases();
  const retryMs = [350, 900, 1800];

  let lastError: unknown;
  for (const base of bases) {
    const urls = buildKalshiUrls(base, limit);
    const byExternalId = new Map<string, KalshiMarketSnapshot>();

    for (const url of urls) {
      const isEventsEndpoint = url.includes("/events/");
      let pageCursor: string | null = null;
      const seenCursors = new Set<string>();

      for (let page = 0; page < 8; page += 1) {
        const requestUrl = new URL(url);
        if (pageCursor) {
          if (seenCursors.has(pageCursor)) {
            break;
          }
          seenCursors.add(pageCursor);
          requestUrl.searchParams.set("cursor", pageCursor);
        }

        let payload: unknown | null = null;
        for (let attempt = 0; attempt < retryMs.length; attempt += 1) {
          try {
            const response = await fetchWithTimeout(requestUrl.toString(), 8_000);
            if (!response.ok) {
              throw new Error(`kalshi_http_${response.status}:${requestUrl.toString()}`);
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.toLowerCase().includes("application/json")) {
              const textBody = await response.text();
              if (textBody.toLowerCase().includes("api has been moved")) {
                throw new Error(`kalshi_api_moved:${requestUrl.toString()}`);
              }
              throw new Error(`kalshi_non_json_response:${requestUrl.toString()}`);
            }

            payload = (await response.json()) as unknown;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < retryMs.length - 1) {
              await sleep(retryMs[attempt]);
            }
          }
        }

        if (payload === null) {
          break;
        }

        const rawList = extractEntries(payload);

        const snapshots = rawList
          .map((entry, index): KalshiMarketSnapshot | null => {
            const rawExternalId = String(
              entry.event_ticker ?? entry.ticker ?? entry.market_ticker ?? entry.id ?? `kalshi-${Date.now()}-${index}`
            );
            const externalId = isEventsEndpoint ? `EVT-${rawExternalId}` : rawExternalId;
            const title = String(entry.title ?? entry.event_title ?? entry.name ?? entry.subtitle ?? rawExternalId);
            const category = String(
              entry.category ?? entry.event_category ?? entry.series_ticker ?? entry.series ?? entry.league ?? "General"
            );
            const seriesTicker = String(entry.series_ticker ?? entry.event_ticker ?? "");

            if (
              isMultiLegMarket({
                externalId: rawExternalId,
                title,
                category,
                seriesTicker
              })
            ) {
              return null;
            }

            const yesPrice = clamp(isEventsEndpoint ? deriveEventYesPrice(entry) : deriveYesPrice(entry), 1, 99);

            return {
              externalId,
              title,
              category,
              yesPrice,
              noPrice: clamp(100 - yesPrice, 1, 99),
              volume: deriveVolume(entry),
              status: normalizeStatus(entry.status ?? entry.event_status),
              closeTime: toEpoch(
                entry.close_time ??
                  entry.expiration_time ??
                  entry.close_date ??
                  entry.event_close_time ??
                  entry.event_end_time ??
                  entry.end_time ??
                  entry.start_time
              ),
              source: "kalshi"
            };
          })
          .filter((item): item is KalshiMarketSnapshot => item !== null && item.title.length > 0);

        for (const snapshot of snapshots) {
          const existing = byExternalId.get(snapshot.externalId);
          if (!existing || snapshot.volume > existing.volume) {
            byExternalId.set(snapshot.externalId, snapshot);
          }
        }

        const nextCursor = extractNextCursor(payload);
        if (!nextCursor || rawList.length === 0 || nextCursor === pageCursor) {
          break;
        }
        pageCursor = nextCursor;
      }
    }

    if (byExternalId.size > 0) {
      const all = [...byExternalId.values()];
      const events = all.filter((item) => item.externalId.startsWith("EVT-"));
      if (events.length >= Math.min(10, limit)) {
        return events.sort((a, b) => b.volume - a.volume).slice(0, limit);
      }
      if (events.length > 0) {
        const contracts = all.filter((item) => !item.externalId.startsWith("EVT-"));
        const merged = [...events.sort((a, b) => b.volume - a.volume), ...contracts.sort((a, b) => b.volume - a.volume)];
        return merged.slice(0, limit);
      }
      return all.sort((a, b) => b.volume - a.volume).slice(0, limit);
    }
  }

  throw new Error(`kalshi_fetch_failed:${String(lastError)}`);
}
