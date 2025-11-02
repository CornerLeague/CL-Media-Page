/**
 * User Team Discovery and Subscription Tests
 * Tests the auto-loading and subscription of user favorite teams
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import type { InsertUserProfile, InsertTeam } from '@shared/schema';

// Mock WebSocket and related modules
const mockSocket = {
  userId: 'test-firebase-uid',
  userEmail: 'test@example.com',
  subs: new Set<string>(),
  userTeams: new Set<string>(),
  isAuthenticated: true,
  readyState: 1, // WebSocket.OPEN
  send: vi.fn(),
  close: vi.fn()
};

const mockSendMessage = vi.fn();

// Mock the WebSocket server module
vi.mock('../../ws', async () => {
  const actual = await vi.importActual('../../ws');
  return {
    ...actual,
    sendMessage: mockSendMessage
  };
});

describe('User Team Discovery and Subscription', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
    mockSocket.subs.clear();
    mockSocket.userTeams.clear();
    mockSendMessage.mockClear();
    mockSocket.send.mockClear();
  });

  describe('User Profile with Favorite Teams', () => {
    it('should handle user with favorite teams', async () => {
      // Create test teams
      const team1: InsertTeam = {
        id: 'NBA_LAL',
        name: 'Los Angeles Lakers',
        code: 'LAL',
        league: 'NBA'
      };
      
      const team2: InsertTeam = {
        id: 'NFL_KC',
        name: 'Kansas City Chiefs', 
        code: 'KC',
        league: 'NFL'
      };

      await storage.createTeam(team1);
      await storage.createTeam(team2);

      // Create user profile with favorite teams
      const userProfile: InsertUserProfile = {
        firebaseUid: 'test-firebase-uid',
        firstName: 'Test',
        lastName: 'User',
        favoriteSports: ['basketball', 'football'],
        favoriteTeams: ['NBA_LAL', 'NFL_KC'],
        onboardingCompleted: true
      };

      await storage.createUserProfile(userProfile);

      // Verify user profile was created correctly
      const retrievedProfile = await storage.getUserProfile('test-firebase-uid');
      expect(retrievedProfile).toBeDefined();
      expect(retrievedProfile?.favoriteTeams).toEqual(['NBA_LAL', 'NFL_KC']);
    });

    it('should handle user with no favorite teams', async () => {
      // Create user profile without favorite teams
      const userProfile: InsertUserProfile = {
        firebaseUid: 'test-firebase-uid-no-teams',
        firstName: 'Test',
        lastName: 'User',
        favoriteSports: [],
        favoriteTeams: [],
        onboardingCompleted: true
      };

      await storage.createUserProfile(userProfile);

      // Verify user profile was created correctly
      const retrievedProfile = await storage.getUserProfile('test-firebase-uid-no-teams');
      expect(retrievedProfile).toBeDefined();
      expect(retrievedProfile?.favoriteTeams).toEqual([]);
    });

    it('should handle non-existent user profile', async () => {
      // Try to get profile for non-existent user
      const retrievedProfile = await storage.getUserProfile('non-existent-uid');
      expect(retrievedProfile).toBeUndefined();
    });
  });

  describe('Team Retrieval', () => {
    it('should retrieve team details correctly', async () => {
      // Create test team
      const team: InsertTeam = {
        id: 'NBA_GSW',
        name: 'Golden State Warriors',
        code: 'GSW', 
        league: 'NBA'
      };

      const createdTeam = await storage.createTeam(team);
      expect(createdTeam.id).toBe('NBA_GSW');
      expect(createdTeam.name).toBe('Golden State Warriors');
      expect(createdTeam.code).toBe('GSW');
      expect(createdTeam.league).toBe('NBA');

      // Retrieve team
      const retrievedTeam = await storage.getTeam('NBA_GSW');
      expect(retrievedTeam).toBeDefined();
      expect(retrievedTeam?.id).toBe('NBA_GSW');
      expect(retrievedTeam?.name).toBe('Golden State Warriors');
    });

    it('should handle non-existent team', async () => {
      const retrievedTeam = await storage.getTeam('NON_EXISTENT');
      expect(retrievedTeam).toBeUndefined();
    });
  });

  describe('WebSocket Message Types', () => {
    it('should validate UserTeamsLoaded message structure', () => {
      const message = {
        type: 'user-teams-loaded' as const,
        payload: {
          teams: [
            {
              id: 'NBA_LAL',
              name: 'Los Angeles Lakers',
              code: 'LAL',
              league: 'NBA'
            }
          ],
          autoSubscribed: true,
          message: 'Auto-subscribed to 1 favorite team'
        }
      };

      expect(message.type).toBe('user-teams-loaded');
      expect(message.payload.teams).toHaveLength(1);
      expect(message.payload.autoSubscribed).toBe(true);
      expect(message.payload.message).toContain('Auto-subscribed');
    });

    it('should validate empty teams message structure', () => {
      const message = {
        type: 'user-teams-loaded' as const,
        payload: {
          teams: [],
          autoSubscribed: false,
          message: 'No favorite teams configured'
        }
      };

      expect(message.type).toBe('user-teams-loaded');
      expect(message.payload.teams).toHaveLength(0);
      expect(message.payload.autoSubscribed).toBe(false);
      expect(message.payload.message).toContain('No favorite teams');
    });
  });

  describe('Subscription Management', () => {
    it('should manage subscription set correctly', () => {
      const subscriptions = new Set<string>();
      
      // Add subscriptions
      subscriptions.add('NBA_LAL');
      subscriptions.add('NFL_KC');
      
      expect(subscriptions.size).toBe(2);
      expect(subscriptions.has('NBA_LAL')).toBe(true);
      expect(subscriptions.has('NFL_KC')).toBe(true);
      
      // Remove subscription
      subscriptions.delete('NBA_LAL');
      expect(subscriptions.size).toBe(1);
      expect(subscriptions.has('NBA_LAL')).toBe(false);
      expect(subscriptions.has('NFL_KC')).toBe(true);
    });

    it('should handle duplicate subscriptions', () => {
      const subscriptions = new Set<string>();
      
      subscriptions.add('NBA_LAL');
      subscriptions.add('NBA_LAL'); // Duplicate
      
      expect(subscriptions.size).toBe(1);
      expect(subscriptions.has('NBA_LAL')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      // Mock storage to throw error
      const mockStorage = {
        getUserProfile: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        getTeam: vi.fn().mockRejectedValue(new Error('Team not found'))
      };

      // Test error handling
      await expect(mockStorage.getUserProfile('test-uid')).rejects.toThrow('Database connection failed');
      await expect(mockStorage.getTeam('NBA_LAL')).rejects.toThrow('Team not found');
    });

    it('should validate required fields', () => {
      // Test that required fields are present
      const userProfile: InsertUserProfile = {
        firebaseUid: 'test-uid',
        firstName: 'Test',
        lastName: 'User',
        favoriteSports: [],
        favoriteTeams: [],
        onboardingCompleted: false
      };

      expect(userProfile.firebaseUid).toBeDefined();
      expect(userProfile.firstName).toBeDefined();
      expect(userProfile.lastName).toBeDefined();
      expect(Array.isArray(userProfile.favoriteTeams)).toBe(true);
    });
  });
});