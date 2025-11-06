import { db } from "../db";
import { teams } from "../../shared/schema";
import { eq } from "drizzle-orm";

async function addTestTeam() {
  console.log("🧪 Seeding a test team for verification...\n");

  if (!db) {
    console.error("❌ Database not configured (config.databaseUrl missing). Set DATABASE_URL and retry.");
    process.exit(1);
  }

  try {
    const testTeamId = "TEAM_TEST_VERIFY";

    // Check if team already exists
    const existing = await db.select().from(teams).where(eq(teams.id, testTeamId));
    if (existing.length > 0) {
      console.log(`✓ Test team already exists (id: ${testTeamId})`);
      process.exit(0);
      return;
    }

    // Insert minimal valid team
    const [inserted] = await db
      .insert(teams)
      .values({
        id: testTeamId,
        league: "NBA",
        code: "TEST",
        name: "Test Verify Team",
      })
      .returning();

    console.log(`✓ Inserted test team: ${inserted.id} (${inserted.name}, ${inserted.league})`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to insert test team:", error);
    process.exit(1);
  }
}

addTestTeam();