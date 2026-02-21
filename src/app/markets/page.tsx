import Link from "next/link";

import { listMarketCards } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function MarketIndexPage() {
  const markets = await listMarketCards({ limit: 200 });

  return (
    <main className="page-shell stack">
      <div className="row">
        <h1 className="page-title">Markets</h1>
        <Link href="/" className="badge">
          Back to Dashboard
        </Link>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Status</th>
              <th>Yes</th>
              <th>No</th>
              <th>Volume</th>
              <th>Signal</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr key={market.id}>
                <td>
                  <Link href={`/markets/${market.id}`}>{market.title}</Link>
                </td>
                <td>{market.status}</td>
                <td>{market.yesPrice.toFixed(0)}%</td>
                <td>{market.noPrice.toFixed(0)}%</td>
                <td>${market.volume.toLocaleString()}</td>
                <td>{(market.opportunitySignal * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
