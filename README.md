# Agentic Prediction Markets Terminal (MVP)

Local demo MVP for an agentic forecasting infrastructure with:
- Live Kalshi market sync (read-only)
- Transparent orchestration and prediction runs
- Simulated trade execution and PnL settlement
- Feedback correction flywheel with trust-weight updates
- Dashboard + market detail terminal UI

## Stack
- Next.js (App Router) + TypeScript
- SQLite + Drizzle ORM
- Zod validation
- node-cron worker
- Vitest + Playwright

## Runtime
- Recommended Node.js: `22.x` (see `.nvmrc`).
- `npm run dev` enforces Node 22.
- Use `npm run dev:clean` when you need to clear `.next` cache before startup.

## Quick start
```bash
nvm use 22
npm install
npm run db:init
npm run dev
```

In another terminal:
```bash
npm run worker
```

Open `http://localhost:3000`.

## If dev server shows missing chunk/module errors
```bash
npm run dev:clean
```

If it persists:
```bash
rm -rf .next node_modules package-lock.json
unset __NEXT_DEVTOOL_SEGMENT_EXPLORER
nvm use 22
npm install
npm run dev
```

## Environment
Copy `.env.example` to `.env.local`.

Optional settings:
- `OPENAI_API_KEY` for LLM blending in prediction runs
- `KALSHI_BASE_URL` override (defaults to `https://api.elections.kalshi.com/trade-api/v2`)
- `DEMO_BANKROLL_USD` for position sizing

## API endpoints
- `GET /api/markets?status=open&limit=50`
- `POST /api/sync/kalshi`
- `POST /api/predictions/run`
- `POST /api/executions/simulate`
- `POST /api/resolutions`
- `POST /api/feedback/generate`
- `GET|POST|PUT|DELETE /api/agents`

## Tests
```bash
npm test
npm run test:e2e
```

## Demo loop
1. Sync markets (`/api/sync/kalshi` from dashboard button).
2. Open a market page and run prediction.
3. Simulate a position.
4. Resolve market (YES/NO).
5. Generate feedback correction and inspect trust updates.
