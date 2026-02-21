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
  return raw.replace(/\/$/, "");
}

function buildCandidateBases(): string[] {
  const fromEnv = process.env.KALSHI_BASE_URL?.trim();
  if (fromEnv) {
    return [normalizeBase(fromEnv)];
  }

  return [
    "https://api.elections.kalshi.com/trade-api/v2",
    "https://api.elections.kalshi.com",
    "https://trading-api.kalshi.com/trade-api/v2"
  ].map(normalizeBase);
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

function coerceNumber(input: unknown, fallback: number): number {
  const num = Number(input);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return num;
}

export async function fetchKalshiMarkets(limit = 50): Promise<KalshiMarketSnapshot[]> {
  const bases = buildCandidateBases();
  const retryMs = [350, 900, 1800];

  let lastError: unknown;
  for (const base of bases) {
    const url = `${base}/markets?status=open&limit=${limit}`;

    for (let attempt = 0; attempt < retryMs.length; attempt += 1) {
      try {
        const response = await fetchWithTimeout(url, 8_000);
        if (!response.ok) {
          throw new Error(`kalshi_http_${response.status}:${base}`);
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("application/json")) {
          const textBody = await response.text();
          if (textBody.toLowerCase().includes("api has been moved")) {
            throw new Error(`kalshi_api_moved:${base}`);
          }
          throw new Error(`kalshi_non_json_response:${base}`);
        }

        const payload = (await response.json()) as {
          markets?: Array<Record<string, unknown>>;
          data?: { markets?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
        };

        const rawList = Array.isArray(payload.markets)
          ? payload.markets
          : Array.isArray(payload.data)
            ? payload.data
            : Array.isArray(payload.data?.markets)
              ? payload.data.markets
              : [];

        const snapshots = rawList
          .map((entry, index): KalshiMarketSnapshot => {
            const externalId = String(
              entry.ticker ?? entry.market_ticker ?? entry.id ?? `kalshi-${Date.now()}-${index}`
            );
            const title = String(entry.title ?? entry.name ?? entry.subtitle ?? externalId);
            const category = String(entry.category ?? entry.series_ticker ?? "General");
            const impliedYes = clamp(
              coerceNumber(
                entry.yes_price ?? entry.yes_ask ?? entry.last_price_yes ?? entry.last_yes_price,
                50
              ),
              1,
              99
            );
            const explicitNo = coerceNumber(
              entry.no_price ?? entry.no_ask ?? entry.last_price_no ?? entry.last_no_price,
              100 - impliedYes
            );

            return {
              externalId,
              title,
              category,
              yesPrice: clamp(impliedYes, 1, 99),
              noPrice: clamp(explicitNo, 1, 99),
              volume: Math.max(0, coerceNumber(entry.volume ?? entry.open_interest, 0)),
              status: normalizeStatus(entry.status),
              closeTime: toEpoch(entry.close_time ?? entry.expiration_time ?? entry.close_date),
              source: "kalshi"
            };
          })
          .filter((item) => item.title.length > 0);

        if (snapshots.length === 0) {
          throw new Error(`kalshi_empty_payload:${base}`);
        }

        return snapshots;
      } catch (error) {
        lastError = error;
        if (attempt < retryMs.length - 1) {
          await sleep(retryMs[attempt]);
        }
      }
    }
  }

  throw new Error(`kalshi_fetch_failed:${String(lastError)}`);
}
