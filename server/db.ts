import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema";
import { config } from "./config";
import { dbConnectionManager, enhancedDb } from "./utils/dbConnection";

if (!config.databaseUrl) {
  // Defer connection until Phase 1 is fully configured
  // Consumers should guard usage when DB URL is absent
}

// Legacy pool for backward compatibility
const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl })
  : undefined;

// Legacy db instance for backward compatibility
export const db = pool ? drizzle(pool, { schema }) : undefined;

// Enhanced database connection with retry logic, circuit breaker, and transaction support
export { dbConnectionManager, enhancedDb };

// Initialize the enhanced connection manager
if (config.databaseUrl) {
  dbConnectionManager.initialize().catch((error) => {
    console.error("Failed to initialize enhanced database connection manager:", error);
  });
}
