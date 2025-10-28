import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema";
import { config } from "./config";

if (!config.databaseUrl) {
  // Defer connection until Phase 1 is fully configured
  // Consumers should guard usage when DB URL is absent
}

const pool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl })
  : undefined;

export const db = pool ? drizzle(pool, { schema }) : undefined;
