"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { MarketCard } from "@/types/domain";
import { buildMarketPulseEventCards, formatMarketOdds } from "@/lib/markets/event-cards";

interface MarketPulseProps {
  markets: MarketCard[];
  minVolumeUsd?: number;
}

export function MarketPulse({ markets, minVolumeUsd }: MarketPulseProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const events = useMemo(() => buildMarketPulseEventCards(markets), [markets]);
  const rawKalshiCount = useMemo(() => markets.filter((market) => market.source === "kalshi").length, [markets]);
  const rawKalshiHighVolumeCount = useMemo(
    () => markets.filter((market) => market.source === "kalshi" && market.volume >= 1000).length,
    [markets]
  );

  function sync(): void {
    startTransition(async () => {
      setSyncNote(null);
      const response = await fetch("/api/sync/kalshi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 500 })
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            source?: string;
            synced?: number;
            error?: string;
          }
        | null;

      if (!response.ok) {
        const details = payload?.error ? String(payload.error) : `http_${response.status}`;
        setSyncNote(`Sync failed: ${details}`);
        return;
      }

      if (payload?.source === "seed_fallback") {
        setSyncNote(payload.error ? `Sync fallback: ${payload.error}` : "Sync fallback: using seed markets.");
      } else if (payload?.source === "kalshi") {
        setSyncNote(typeof payload.synced === "number" ? `Synced ${payload.synced} markets.` : "Sync complete.");
      }

      router.refresh();
    });
  }

  return (
    <div className="panel stack dashboard-panel">
      <div className="row">
        <h2>Browse Sports Markets</h2>
        <button type="button" onClick={sync} disabled={pending}>
          {pending ? "Syncing..." : "Sync Markets"}
        </button>
      </div>

      <div className="small">Showing all synced events and all liquidity levels.</div>
      {typeof minVolumeUsd === "number" ? (
        <div className="small">Feed floor: volume &gt; ${minVolumeUsd.toLocaleString()} before event grouping.</div>
      ) : null}
      {syncNote ? <div className="small warn">{syncNote}</div> : null}
      {rawKalshiCount > 0 && rawKalshiHighVolumeCount < 10 ? (
        <div className="small warn">
          Feed looks sparse ({rawKalshiHighVolumeCount} markets over $1k). This usually means demo/sandbox Kalshi data,
          not full kalshi.com production sports inventory.
        </div>
      ) : null}

      <div className="sports-grid panel-scroll">
        {events.map((event) => (
          <div className="sports-card" key={event.eventKey}>
            <div className="row">
              <strong>{event.title}</strong>
              <span className="badge">{event.sport}</span>
            </div>
            <div className="sports-outcome-row">
              <span className="sports-team">{event.sideA.label}</span>
              <span className="sports-odds">{formatMarketOdds(event.sideA.price)}</span>
              <Link href={`/markets/${event.sideA.marketId}`} className="sports-price-pill">
                {event.sideA.price.toFixed(0)}%
              </Link>
            </div>
            <div className="sports-prob-track">
              <span style={{ width: `${Math.max(2, Math.min(98, event.sideA.price))}%` }} />
            </div>
            <div className="sports-outcome-row">
              <span className="sports-team">{event.sideB.label}</span>
              <span className="sports-odds">{formatMarketOdds(event.sideB.price)}</span>
              <Link href={`/markets/${event.sideB.marketId}`} className="sports-price-pill">
                {event.sideB.price.toFixed(0)}%
              </Link>
            </div>
            <div className="sports-card-footer">
              <span>${event.volume.toLocaleString()} vol</span>
              <span>{event.marketCount} markets</span>
            </div>
          </div>
        ))}
        {events.length === 0 ? <div className="small">No events returned from the current feed.</div> : null}
      </div>
    </div>
  );
}
