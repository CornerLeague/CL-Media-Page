import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScoresAgent } from '../../agents/scoresAgent';
import { MemStorage } from '../../storage';
import { DummyScoreSource } from '../../agents/adapters/dummyScoreSource';
import { InsertGame } from '../../../shared/schema';
import type { GameScore } from '../../agents/types';
import { broadcastUserTeamUpdate, broadcastUserTeamStatusChange } from '../../ws';

// Mock the WebSocket broadcasting functions
vi.mock('../../ws', () => ({
  broadcastUserTeamUpdate: vi.fn(),
  broadcastUserTeamStatusChange: vi.fn(),
}));

describe('ScoresAgent Smart Broadcasting Integration', () => {
  let scoresAgent: ScoresAgent;
  let storage: MemStorage;
  let scoreSource: DummyScoreSource;

  beforeEach(() => {
    storage = new MemStorage();
    scoreSource = new DummyScoreSource();
    scoresAgent = new ScoresAgent(scoreSource, storage);
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('Smart Broadcasting Integration', () => {
    it('should call broadcastUserTeamUpdate for score changes', async () => {
      // Setup existing game
      const oldGame: InsertGame = {
        id: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 10,
        awayPts: 7,
        status: 'live',
        period: '2',
        timeRemaining: '10:30',
        startTime: new Date(),
      };

      await storage.createGame(oldGame);

      // Mock fetchLive to return updated game with score change
      const updatedGame: GameScore = {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 14,
        awayPts: 10,
        status: 'in_progress',
        period: '2',
        timeRemaining: '10:30',
        startTime: oldGame.startTime,
        source: 'test'
      };

      vi.spyOn(scoreSource, 'fetchLive').mockResolvedValue([updatedGame]);

      // Run the agent
       await scoresAgent.runOnce({ 
         sport: 'NBA', 
         mode: 'live',
         teamIds: ['NBA_LAL', 'NBA_BOS']
       });

       // Verify broadcastUserTeamUpdate was called
      expect(broadcastUserTeamUpdate).toHaveBeenCalled();
    });

    it('should call broadcastUserTeamStatusChange for status changes', async () => {
      // Setup existing game
      const oldGame: InsertGame = {
        id: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 21,
        awayPts: 14,
        status: 'in_progress',
        period: '4',
        timeRemaining: '2:00',
        startTime: new Date(),
      };

      await storage.createGame(oldGame);

      // Mock fetchLive to return game with status change
      const updatedGame: GameScore = {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 21,
        awayPts: 14,
        status: 'final',
        period: '4',
        timeRemaining: '0:00',
        startTime: oldGame.startTime,
        source: 'test'
      };

      vi.spyOn(scoreSource, 'fetchLive').mockResolvedValue([updatedGame]);

      // Run the agent
       await scoresAgent.runOnce({ 
         sport: 'NBA', 
         mode: 'live',
         teamIds: ['NBA_LAL', 'NBA_BOS']
       });

      // Verify broadcastUserTeamStatusChange was called for both teams
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_LAL_BOS',
        'NBA_LAL',
        'unknown',
        'final'
      );
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_LAL_BOS',
        'NBA_BOS',
        'unknown',
        'final'
      );
    });

    it('should handle both score and status changes', async () => {
      // Setup existing game
      const oldGame: InsertGame = {
        id: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 10,
        awayPts: 7,
        status: 'live',
        period: '1',
        timeRemaining: '5:00',
        startTime: new Date(),
      };

      await storage.createGame(oldGame);

      // Mock fetchLive to return game with both score and status changes
      const updatedGame: GameScore = {
        gameId: oldGame.id,
        homeTeamId: oldGame.homeTeamId,
        awayTeamId: oldGame.awayTeamId,
        homePts: 14,
        awayPts: 10,
        status: 'final',
        period: '4',
        timeRemaining: '0:00',
        startTime: oldGame.startTime,
        source: 'test'
      };

      vi.spyOn(scoreSource, 'fetchLive').mockResolvedValue([updatedGame]);

      // Run the agent
      // Run the agent
       await scoresAgent.runOnce({ 
         sport: 'NBA', 
         mode: 'live',
         teamIds: ['NBA_LAL', 'NBA_BOS']
       });

      // Verify both types of broadcasts were called
      expect(broadcastUserTeamUpdate).toHaveBeenCalled();
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_LAL_BOS',
        'NBA_LAL',
        'unknown',
        'final'
      );
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_LAL_BOS',
        'NBA_BOS',
        'unknown',
        'final'
      );
    });

    it('should handle new games without existing data', async () => {
      // Mock fetchLive to return a new game
      const newGame: GameScore = {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 21,
        awayPts: 14,
        status: 'in_progress',
        period: '3',
        timeRemaining: '15:00',
        startTime: new Date(),
        source: 'test'
      };

      vi.spyOn(scoreSource, 'fetchLive').mockResolvedValue([newGame]);

      // Run the agent
      await scoresAgent.runOnce({ 
         sport: 'NBA', 
         mode: 'live',
         teamIds: ['NBA_LAL', 'NBA_BOS']
       });

       // Verify both types of broadcasts were called
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_LAL_BOS',
        'NBA_LAL',
        'unknown',
        'in_progress'
      );
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_LAL_BOS',
        'NBA_BOS',
        'unknown',
        'in_progress'
      );
    });

    it('should handle errors gracefully', async () => {
      // Mock fetchLive to throw an error
      vi.spyOn(scoreSource, 'fetchLive').mockRejectedValue(new Error('API Error'));

      // Run the agent - should not throw
      const result = await scoresAgent.runOnce({ 
         sport: 'NBA', 
         mode: 'live',
         teamIds: ['NBA_LAL', 'NBA_BOS']
       });

       // Should return error count
      expect(result.errors).toBeGreaterThan(0);

      // Verify no broadcasts were made
      expect(broadcastUserTeamUpdate).not.toHaveBeenCalled();
      expect(broadcastUserTeamStatusChange).not.toHaveBeenCalled();
    });

    it('should not broadcast when no changes detected', async () => {
      // Setup existing game
      const existingGame: GameScore = {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 10,
        awayPts: 7,
        status: 'in_progress',
        period: '1',
        timeRemaining: '5:00',
        startTime: new Date(),
        source: 'test'
      };

      await storage.createGame({
        id: existingGame.gameId,
        homeTeamId: existingGame.homeTeamId,
        awayTeamId: existingGame.awayTeamId,
        homePts: existingGame.homePts,
        awayPts: existingGame.awayPts,
        status: existingGame.status,
        period: existingGame.period,
        timeRemaining: existingGame.timeRemaining,
        startTime: existingGame.startTime
      });

      // Mock fetchLive to return identical game (without source to match DB record)
      const identicalGame: GameScore = {
        gameId: existingGame.gameId,
        homeTeamId: existingGame.homeTeamId,
        awayTeamId: existingGame.awayTeamId,
        homePts: existingGame.homePts,
        awayPts: existingGame.awayPts,
        status: existingGame.status,
        period: existingGame.period,
        timeRemaining: existingGame.timeRemaining,
        startTime: existingGame.startTime,
        source: 'test'
      };

      vi.spyOn(scoreSource, 'fetchLive').mockResolvedValue([identicalGame]);

      // Run the agent
      const result = await scoresAgent.runOnce({ 
         sport: 'NBA', 
         mode: 'live',
         teamIds: ['NBA_LAL', 'NBA_BOS']
       });

       // Should persist the game (ScoresAgent always persists, even if identical)
      expect(result.persisted).toBe(1);

      // Verify no broadcasts were made
      expect(broadcastUserTeamUpdate).not.toHaveBeenCalled();
      expect(broadcastUserTeamStatusChange).not.toHaveBeenCalled();
    });

    it('should handle multiple games with different change types', async () => {
      // Setup existing games
      const game1: InsertGame = {
        id: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 10,
        awayPts: 7,
        status: 'in_progress',
        period: '1',
        timeRemaining: '5:00',
        startTime: new Date(),
      };

      const game2: InsertGame = {
        id: 'NBA_2025_01_GSW_MIA',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_MIA',
        homePts: 15,
        awayPts: 12,
        status: 'in_progress',
        period: '2',
        timeRemaining: '8:30',
        startTime: new Date(),
      };

      await storage.createGame(game1);
      await storage.createGame(game2);

      // Mock fetchLive to return games with different changes
      const updatedGame1: GameScore = {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 14, // Score change
        awayPts: 10,
        status: 'in_progress',
        period: '1',
        timeRemaining: '5:00',
        startTime: new Date(),
        source: 'test'
      };

      const updatedGame2: GameScore = {
        gameId: 'NBA_2025_01_GSW_MIA',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_MIA',
        homePts: 15,
        awayPts: 12,
        status: 'final', // Status change
        period: '2',
        timeRemaining: '0:00',
        startTime: new Date(),
        source: 'test'
      };

      vi.spyOn(scoreSource, 'fetchLive').mockResolvedValue([updatedGame1, updatedGame2]);

      // Run the agent
      const result = await scoresAgent.runOnce({ 
         sport: 'NBA', 
         mode: 'live',
         teamIds: ['NBA_LAL', 'NBA_BOS', 'NBA_GSW', 'NBA_MIA']
       });

       // Verify appropriate broadcasts for each game
      expect(broadcastUserTeamUpdate).toHaveBeenCalled(); // For game1 score change
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_GSW_MIA',
        'NBA_GSW',
        'unknown',
        'final'
      );
      expect(broadcastUserTeamStatusChange).toHaveBeenCalledWith(
        'NBA_2025_01_GSW_MIA',
        'NBA_MIA',
        'unknown',
        'final'
      );
    });
  });
});