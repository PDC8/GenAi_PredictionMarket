import { initializeDatabase } from "@/lib/db/init";
import { dbPath } from "@/lib/db/client";
import { listAgents, listMarketCards } from "@/lib/db/repository";

async function main(): Promise<void> {
  await initializeDatabase();
  const [agents, markets] = await Promise.all([listAgents(), listMarketCards({ limit: 10 })]);

  console.log(`Database ready at ${dbPath}`);
  console.log(`Seeded agents: ${agents.length}`);
  console.log(`Seeded markets: ${markets.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
