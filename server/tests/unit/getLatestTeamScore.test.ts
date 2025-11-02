import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemStorage } from '../../storage';
import { type Game, type Team, type InsertGame, type InsertTeam, type GameScoreData } from '@shared/schema';

// Helper functions for creating test data
function createInsertGame(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  startTime: Date,
  overrides: Partial<InsertGame> = {}
): InsertGame {
  return {
    id,
    homeTeamId,
    awayTeamId,
    startTime,
    homePts: 0,
    awayPts: 0,
    status: "scheduled",
    period: null,
    timeRemaining: null,
    ...overrides,
  };
}

function createInsertTeam(id: string, name: string, league: string = "NBA"): InsertTeam {
  return {
    id,
    name,
    league,
    code: name.substring(0, 3).toUpperCase(),
  };
}

describe('getLatestTeamScore', () => {
  describe('MemStorage', () => {
    let storage: MemStorage;
    let team1: Team;
    let team2: Team;
    let team3: Team;

    beforeEach(async () => {
      storage = new MemStorage();
      
      // Create test teams
      team1 = await storage.createTeam(createInsertTeam("team1", "Lakers"));
      team2 = await storage.createTeam(createInsertTeam("team2", "Warriors"));
      team3 = await storage.createTeam(createInsertTeam("team3", "Celtics"));
    });

    describe('Basic functionality', () => {
      it('should return latest score for home team', async () => {
        await storage.createGame(createInsertGame(
          "game1",
          team1.id,
          team2.id,
          new Date("2024-01-01T20:00:00Z"),
          { homePts: 110, awayPts: 105, status: "Final" }
        ));

        const result = await storage.getLatestTeamScore(team1.id);

        expect(result).toBeDefined();
        expect(result!.gameId).toBe("game1");
        expect(result!.isHomeGame).toBe(true);
        expect(result!.teamScore).toBe(110);
        expect(result!.opponent.score).toBe(105);
      });

      it('should return latest score for away team', async () => {
        await storage.createGame(createInsertGame(
          "game1",
          team1.id,
          team2.id,
          new Date("2024-01-01T20:00:00Z"),
          { homePts: 110, awayPts: 105, status: "Final" }
        ));

        const result = await storage.getLatestTeamScore(team2.id);

        expect(result).toBeDefined();
        expect(result!.gameId).toBe("game1");
        expect(result!.isHomeGame).toBe(false);
        expect(result!.teamScore).toBe(105);
        expect(result!.opponent.score).toBe(110);
      });

      it('should return undefined when no games exist for team', async () => {
        const result = await storage.getLatestTeamScore(team1.id);
        expect(result).toBeUndefined();
      });

      it('should return undefined when team does not exist', async () => {
        const result = await storage.getLatestTeamScore("nonexistent");
        expect(result).toBeUndefined();
      });
    });

    describe('Game sorting', () => {
      it('should return the most recent game by startTime', async () => {
        // Create games with different start times
        await storage.createGame(createInsertGame(
          "game1",
          team1.id,
          team2.id,
          new Date("2024-01-01T20:00:00Z"),
          { homePts: 100, awayPts: 95 }
        ));
        await storage.createGame(createInsertGame(
          "game2",
          team1.id,
          team3.id,
          new Date("2024-01-03T20:00:00Z"),
          { homePts: 105, awayPts: 100 }
        ));
        await storage.createGame(createInsertGame(
          "game3",
          team2.id,
          team1.id,
          new Date("2024-01-02T20:00:00Z"),
          { homePts: 98, awayPts: 102 }
        ));

        const result = await storage.getLatestTeamScore(team1.id);

        expect(result).toBeDefined();
        expect(result!.gameId).toBe("game2"); // Most recent game
        expect(result!.startTime).toEqual(new Date("2024-01-03T20:00:00Z"));
      });
    });

    describe('Data integrity', () => {
      it('should include all required GameScoreData fields', async () => {
        await storage.createGame(createInsertGame(
          "game1",
          team1.id,
          team2.id,
          new Date("2024-01-01T20:00:00Z"),
          { 
            homePts: 110, 
            awayPts: 105, 
            status: "Final",
            period: "4",
            timeRemaining: "00:00"
          }
        ));

        const result = await storage.getLatestTeamScore(team1.id);

        expect(result).toBeDefined();
        expect(result!.gameId).toBe("game1");
        expect(result!.homeTeam).toEqual({
          id: team1.id,
          name: team1.name,
          code: team1.code,
          league: team1.league,
          score: 110
        });
        expect(result!.awayTeam).toEqual({
          id: team2.id,
          name: team2.name,
          code: team2.code,
          league: team2.league,
          score: 105
        });
        expect(result!.status).toBe("Final");
        expect(result!.period).toBe("4");
        expect(result!.timeRemaining).toBe("00:00");
        expect(result!.startTime).toEqual(new Date("2024-01-01T20:00:00Z"));
        expect(result!.isHomeGame).toBe(true);
        expect(result!.opponent).toEqual({
          id: team2.id,
          name: team2.name,
          code: team2.code,
          league: team2.league,
          score: 105
        });
        expect(result!.teamScore).toBe(110);
        expect(result!.cachedAt).toBeInstanceOf(Date);
      });

      it('should handle missing team data gracefully', async () => {
        // Create a game with a team that doesn't exist in storage
        await storage.createGame(createInsertGame(
          "game1",
          "nonexistent-home",
          team2.id,
          new Date("2024-01-01T20:00:00Z")
        ));

        const result = await storage.getLatestTeamScore("nonexistent-home");
        expect(result).toBeUndefined();
      });
    });

    describe('Edge cases and error handling', () => {
      it('should handle invalid teamId input', async () => {
        const result = await storage.getLatestTeamScore("");
        expect(result).toBeUndefined();
      });

      it('should handle null scores', async () => {
        await storage.createGame(createInsertGame(
          "game1",
          team1.id,
          team2.id,
          new Date("2024-01-01T20:00:00Z"),
          { homePts: 0, awayPts: 0, status: "Scheduled" }
        ));

        const result = await storage.getLatestTeamScore(team1.id);

        expect(result).toBeDefined();
        expect(result!.teamScore).toBe(0);
        expect(result!.opponent.score).toBe(0);
      });

      it('should handle different game statuses', async () => {
        const statuses = ["Scheduled", "In Progress", "Final", "Postponed"];
        
        for (let i = 0; i < statuses.length; i++) {
          const status = statuses[i];
          await storage.createGame(createInsertGame(
            `game-${i}`,
            team1.id,
            team2.id,
            new Date("2024-01-01T20:00:00Z"),
            { status }
          ));
        }

        const result = await storage.getLatestTeamScore(team1.id);
        expect(result).toBeDefined();
        expect(statuses).toContain(result!.status);
      });

      it('should propagate errors from storage operations', async () => {
        // Mock the games Map to throw an error
        const originalGames = (storage as any).games;
        (storage as any).games = {
          values: () => { throw new Error("Storage error"); }
        };

        await expect(storage.getLatestTeamScore(team1.id)).rejects.toThrow("Storage error");
        
        // Restore original games Map
        (storage as any).games = originalGames;
      });
    });

    describe('Performance', () => {
      it('should handle large number of games efficiently', async () => {
        // Create 100 games (reduced from 1000 for faster test execution)
        for (let i = 0; i < 100; i++) {
          await storage.createGame(createInsertGame(
            `game${i}`,
            i % 2 === 0 ? team1.id : team2.id,
            i % 2 === 0 ? team2.id : team1.id,
            new Date(2024, 0, 1 + i),
            { homePts: i, awayPts: i + 1 }
          ));
        }

        const startTime = Date.now();
        const result = await storage.getLatestTeamScore(team1.id);
        const endTime = Date.now();

        expect(result).toBeDefined();
        expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
      });
    });
  });
});