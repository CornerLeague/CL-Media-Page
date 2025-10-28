import type { IScoreSource, GameScore, ScheduleGame } from "../types";
import type { InsertGame } from "@shared/schema";

// Dummy adapter that fabricates a few recent games for testing.
export class DummyScoreSource implements IScoreSource {
  async fetchRecentGames(options: { teamIds?: string[]; limit?: number }): Promise<InsertGame[]> {
    const teamIds = options.teamIds ?? [];
    const limit = options.limit ?? 3;
    const out: InsertGame[] = [];
    const now = Date.now();

    for (let i = 0; i < limit; i++) {
      const home = teamIds[i % teamIds.length];
      const away = teamIds[(i + 1) % teamIds.length];
      if (!home || !away || home === away) break;
      const id = `${home}_${away}_${Math.floor(now / 1000)}_${i}`;
      out.push({
        id,
        homeTeamId: home,
        awayTeamId: away,
        homePts: Math.floor(Math.random() * 120),
        awayPts: Math.floor(Math.random() * 120),
        status: "final",
        period: "4",
        timeRemaining: "0:00",
        startTime: new Date(now - 2 * 60 * 60 * 1000),
        // cachedAt is omitted by insert schema
      } as InsertGame);
    }

    return out;
  }

  async fetchLive(teamCodes: string[]): Promise<GameScore[]> {
    const now = Date.now();
    const results: GameScore[] = [];
    for (let i = 0; i < teamCodes.length; i += 2) {
      const homeCode = teamCodes[i];
      const awayCode = teamCodes[i + 1] ?? teamCodes[0];
      if (!homeCode || !awayCode || homeCode === awayCode) continue;
      const homeTeamId = `NBA_${homeCode}`;
      const awayTeamId = `NBA_${awayCode}`;
      results.push({
        gameId: `${homeTeamId}_${awayTeamId}_${Math.floor(now / 1000)}`,
        homeTeamId,
        awayTeamId,
        homePts: Math.floor(Math.random() * 100),
        awayPts: Math.floor(Math.random() * 100),
        status: "in_progress",
        period: String(1 + Math.floor(Math.random() * 4)),
        timeRemaining: `${Math.floor(Math.random() * 11)}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
        startTime: new Date(now - 30 * 60 * 1000),
        source: "dummy",
      });
    }
    return results;
  }

  async fetchSchedule(teamCodes: string[], startDate: Date, endDate: Date): Promise<ScheduleGame[]> {
    const results: ScheduleGame[] = [];
    const startMs = startDate.getTime();
    for (let i = 0; i < teamCodes.length; i += 2) {
      const homeCode = teamCodes[i];
      const awayCode = teamCodes[i + 1] ?? teamCodes[0];
      if (!homeCode || !awayCode || homeCode === awayCode) continue;
      const homeTeamId = `NBA_${homeCode}`;
      const awayTeamId = `NBA_${awayCode}`;
      const gameStart = new Date(startMs + i * 60 * 60 * 1000);
      if (gameStart > endDate) break;
      results.push({
        gameId: `${homeTeamId}_${awayTeamId}_${gameStart.getTime()}`,
        homeTeamId,
        awayTeamId,
        startTime: gameStart,
        status: "scheduled",
        source: "dummy",
      });
    }
    return results;
  }

  async fetchFeaturedGames(sport: string, limit: number): Promise<ScheduleGame[]> {
    const upper = String(sport).toUpperCase();
    const now = Date.now();
    const teams = ["BOS", "LAL", "NYK", "MIA", "GSW", "DAL", "CHI", "PHX"];
    const results: ScheduleGame[] = [];
    for (let i = 0; i < Math.min(limit, teams.length - 1); i++) {
      const homeCode = teams[i];
      const awayCode = teams[(i + 1) % teams.length];
      const homeTeamId = `${upper}_${homeCode}`;
      const awayTeamId = `${upper}_${awayCode}`;
      const startTime = new Date(now + (i + 1) * 60 * 60 * 1000);
      results.push({
        gameId: `${homeTeamId}_${awayTeamId}_${startTime.getTime()}`,
        homeTeamId,
        awayTeamId,
        startTime,
        status: "scheduled",
        source: "dummy",
      });
    }
    return results;
  }
}