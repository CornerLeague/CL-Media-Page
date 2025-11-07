import { db } from "./db";
import * as schema from "../shared/schema";
import { withSource } from "./logger";
import { eq } from "drizzle-orm";
import { seedArticles } from "./seeds/articles";

const log = withSource("seed");

async function main() {
  if (!db) {
    log.error("DATABASE_URL missing or db unavailable. Aborting seed.");
    process.exit(1);
  }

  try {
    log.info("seeding teams");
    await db
      .insert(schema.teams)
      .values([
        { id: "NBA_BOS", league: "NBA", code: "BOS", name: "Boston Celtics" },
        { id: "NBA_LAL", league: "NBA", code: "LAL", name: "Los Angeles Lakers" },
        { id: "NFL_NE", league: "NFL", code: "NE", name: "New England Patriots" },
        { id: "MLB_BOS", league: "MLB", code: "BOS", name: "Boston Red Sox" },
      ])
      .onConflictDoNothing();

    log.info("seeding user");
    let [user] = await db
      .insert(schema.users)
      .values({ username: "dev", password: "devpass" })
      .onConflictDoNothing()
      .returning();
    if (!user) {
      const existing = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, "dev"));
      user = existing[0];
    }

    log.info({ userId: user.id }, "seeding user profile");
    await db
      .insert(schema.userProfiles)
      .values({
        firebaseUid: "dev-uid-1",
        firstName: "Dev",
        lastName: "User",
        favoriteSports: ["NBA", "NFL"],
        favoriteTeams: ["NBA_BOS", "NFL_NE"],
        onboardingCompleted: true,
      })
      .onConflictDoNothing();

    // Seed articles, news sources, and classifications
    log.info("seeding articles and news sources");
    const articleStats = await seedArticles();
    log.info({ stats: articleStats }, "articles seeded successfully");

    log.info("seed completed successfully");
    process.exit(0);
  } catch (err) {
    log.error({ err }, "seed failed");
    process.exit(1);
  }
}

main();