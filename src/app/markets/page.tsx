import Link from "next/link";

import { listMarketCards } from "@/lib/db/repository";
import { buildMarketPulseEventCards, formatMarketOdds } from "@/lib/markets/event-cards";

export const dynamic = "force-dynamic";
const MIN_MARKET_VOLUME_USD = 0;

export default async function MarketIndexPage() {
  const markets = await listMarketCards({ status: "open", limit: 500 });
  const events = buildMarketPulseEventCards(markets);

  return (
    <main className="page-shell stack">
      <div className="row">
        <h1 className="page-title">Markets</h1>
        <Link href="/" className="badge">
          Back to Dashboard
        </Link>
      </div>

      <div className="panel stack">
        <div className="small">List view. Same event dataset as Market Pulse.</div>
        <div className="small">Feed floor: volume &gt; ${MIN_MARKET_VOLUME_USD.toLocaleString()} before event grouping.</div>
        <div className="panel-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Sport</th>
                <th>Side A</th>
                <th>Side B</th>
                <th>Volume</th>
                <th>Markets</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.eventKey}>
                  <td>
                    <strong>{event.title}</strong>
                  </td>
                  <td>{event.sport}</td>
                  <td>
                    {event.sideA.label} {event.sideA.price.toFixed(0)}% ({formatMarketOdds(event.sideA.price)})
                  </td>
                  <td>
                    {event.sideB.label} {event.sideB.price.toFixed(0)}% ({formatMarketOdds(event.sideB.price)})
                  </td>
                  <td>${event.volume.toLocaleString()}</td>
                  <td>{event.marketCount}</td>
                  <td>
                    <Link href={`/markets/${event.sideA.marketId}`} className="badge">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="small">
                    No events returned from the current feed.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
