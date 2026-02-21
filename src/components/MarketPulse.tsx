"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { MarketCard } from "@/types/domain";

interface MarketPulseProps {
  markets: MarketCard[];
}

export function MarketPulse({ markets }: MarketPulseProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const sorted = [...markets].sort((a, b) => b.opportunitySignal - a.opportunitySignal);

  function sync(): void {
    startTransition(async () => {
      await fetch("/api/sync/kalshi", { method: "POST" });
      router.refresh();
    });
  }

  return (
    <div className="panel stack dashboard-panel">
      <div className="row">
        <h2>Market Pulse (Live)</h2>
        <button type="button" onClick={sync} disabled={pending}>
          {pending ? "Syncing..." : "Sync Markets"}
        </button>
      </div>

      <div className="small">Ranked by opportunity signal x confidence.</div>

      <div className="stack panel-scroll">
        {sorted.map((market) => (
          <Link href={`/markets/${market.id}`} className="item" key={market.id}>
            <div className="row">
              <strong>{market.title}</strong>
              <span className="badge">{market.source}</span>
            </div>
            <div className="row small">
              <span>Yes {market.yesPrice.toFixed(0)}%</span>
              <span>No {market.noPrice.toFixed(0)}%</span>
              <span>Vol ${market.volume.toLocaleString()}</span>
            </div>
            <div className="row small">
              <span className="warn">Opp {(market.opportunitySignal * 100).toFixed(1)}%</span>
              <span>Conf {market.confidence ? `${(market.confidence * 100).toFixed(0)}%` : "n/a"}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
