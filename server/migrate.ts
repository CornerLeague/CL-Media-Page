import path from "path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";
import { withSource } from "./logger";

const log = withSource("migrate");

async function main() {
  if (!db) {
    log.error("DATABASE_URL missing or db unavailable. Aborting migration.");
    process.exit(1);
  }

  const migrationsFolder = path.resolve(import.meta.dirname, "../migrations");
  log.info({ migrationsFolder }, "running migrations");

  try {
    await migrate(db, { migrationsFolder });
    log.info("migrations completed successfully");
    process.exit(0);
  } catch (err) {
    log.error({ err }, "migration failed");
    process.exit(1);
  }
}

main();