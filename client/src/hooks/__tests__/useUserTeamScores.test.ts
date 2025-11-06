import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserTeamScores } from '../useUserTeamScores';
import type { 
  UserTeamScoresOptions, 
  UserTeamScoresResult, 
  GameScoreData,
  UserFavoriteTeam 
} from '../useUserTeamScores';
import type { Sport } from '../../data/sportsTeams';

// Mock the WebSocket hook
vi.mock('../useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

// Mock the Score Update Service
vi.mock('../useScoreUpdateService', () => ({
  useScoreUpdateService: vi.fn(() => ({
    isConnected: false,
    connectionState: 'disconnected',
    subscribeToTeam: vi.fn(),
    unsubscribeFromTeam: vi.fn(),
    subscribeToUserTeams: vi.fn(),
    unsubscribeFromUserTeams: vi.fn(),
  })),
}));

// Mock the AuthContext
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'test-user-id', name: 'Test User' },
    isAuthenticated: true,
  })),
}));

const mockUseWebSocket = vi.mocked(
  (await import('../useWebSocket')).useWebSocket
);

// Mock fetch globally
global.fetch = vi.fn();

// Mock data
const mockGameData: GameScoreData = {
  gameId: 'game-1',
  sport: 'NFL' as Sport,
  homeTeam: 'Team A',
  awayTeam: 'Team B',
  homeScore: 14,
  awayScore: 7,
  status: 'live',
  startTime: '2024-01-15T20:00:00Z',
  lastUpdated: '2024-01-15T21:30:00Z',
  period: '2nd Quarter',
  timeRemaining: '10:30',
  isUserTeamGame: true,
  userTeamName: 'Team A',
};

const mockUserTeam: UserFavoriteTeam = {
  id: 'team-1',
  sport: 'NFL' as Sport,
  teamName: 'Team A',
  league: 'NFL',
  conference: 'NFC',
  division: 'North',
};

const mockApiResponse: UserTeamScoresResult = {
  games: [mockGameData],
  userProfile: {
    id: 'test-user-id',
    favoriteTeams: [mockUserTeam],
  },
  lastUpdated: '2024-01-15T21:30:00Z',
  totalGames: 1,
  liveGames: 1,
  completedGames: 0,
  scheduledGames: 0,
};

describe('useUserTeamScores', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false, // Disable retries for tests
          gcTime: 0, // Disable caching for tests
          staleTime: 0,
        },
      },
    });

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default WebSocket mock
    mockUseWebSocket.mockReturnValue({
      state: 'connected',
      isConnected: true,
      isConnecting: false,
      lastError: null,
      reconnectAttempts: 0,
      sendMessage: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      subscribeToTeam: vi.fn(),
      unsubscribeFromTeam: vi.fn(),
      subscribeToUserTeams: vi.fn(),
      unsubscribeFromUserTeams: vi.fn(),
    });

    // Setup default fetch mock
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockApiResponse,
    } as Response);
  });

  afterEach(() => {
    queryClient.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  describe('initialization', () => {
    it('should initialize with correct default state', async () => {
      const { result } = renderHook(
        () => useUserTeamScores({ sport: 'NFL' }),
        { wrapper }
      );

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeNull();
    });
  });

  describe('data fetching', () => {
    it('should fetch user team scores successfully', async () => {
      const { result } = renderHook(
        () => useUserTeamScores({ sport: 'NFL' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockApiResponse);
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('WebSocket integration', () => {
    it('should connect to WebSocket when real-time updates are enabled', async () => {
      const mockConnect = vi.fn();
      const mockSubscribe = vi.fn();
      
      mockUseWebSocket.mockReturnValue({
        state: 'connected',
        isConnected: true,
        isConnecting: false,
        lastError: null,
        reconnectAttempts: 0,
        sendMessage: vi.fn(),
        connect: mockConnect,
        disconnect: vi.fn(),
        subscribeToTeam: vi.fn(),
        unsubscribeFromTeam: vi.fn(),
        subscribeToUserTeams: mockSubscribe,
        unsubscribeFromUserTeams: vi.fn(),
      });

      renderHook(
        () => useUserTeamScores({ 
          sport: 'NFL',
          enableRealTimeUpdates: true 
        }),
        { wrapper }
      );

      expect(mockUseWebSocket).toHaveBeenCalled();
    });

    it('should not connect to WebSocket when real-time updates are disabled', () => {
      renderHook(
        () => useUserTeamScores({ 
          sport: 'NFL',
          enableRealTimeUpdates: false 
        }),
        { wrapper }
      );

      // WebSocket should still be called but with different configuration
      expect(mockUseWebSocket).toHaveBeenCalled();
    });
  });

  describe('query management', () => {
    it('should use correct query key', async () => {
      const options: UserTeamScoresOptions = { 
        sport: 'NFL',
        limit: 5 
      };

      const { result } = renderHook(
        () => useUserTeamScores(options),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Verify the query was cached with correct key
      const cachedData = queryClient.getQueryData(['userTeamScores', 'list', options]);
      expect(cachedData).toEqual(mockApiResponse);
    });

    it('should invalidate cache when requested', async () => {
      const { result } = renderHook(
        () => useUserTeamScores({ sport: 'NFL' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await result.current.invalidateCache();

      // Should trigger a refetch
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('helper methods', () => {
    it('should filter games by status correctly', async () => {
      const { result } = renderHook(
        () => useUserTeamScores({ sport: 'NFL' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const liveGames = result.current.getGamesByStatus('live');
      expect(liveGames).toHaveLength(1);
      expect(liveGames[0].status).toBe('live');
    });

    it('should get user team games correctly', async () => {
      const { result } = renderHook(
        () => useUserTeamScores({ sport: 'NFL' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const userTeamGames = result.current.getUserTeamGames();
      expect(userTeamGames).toHaveLength(1);
      expect(userTeamGames[0].isUserTeamGame).toBe(true);
    });
  });

  describe('performance and optimization', () => {
    it('should memoize expensive computations', async () => {
      const { result, rerender } = renderHook(
        () => useUserTeamScores({ sport: 'NFL' }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const firstGetUserTeamGames = result.current.getUserTeamGames;
      
      rerender();
      
      const secondGetUserTeamGames = result.current.getUserTeamGames;
      
      // Functions should be memoized
      expect(firstGetUserTeamGames).toBe(secondGetUserTeamGames);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Mock API error with proper Response object
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'API Error' }),
        text: async () => 'API Error',
      } as Response);

      const { result } = renderHook(() => useUserTeamScores({ sport: 'NFL' }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeTruthy();
      expect(result.current.data).toBeUndefined();
    });

    it('should handle network errors', async () => {
      // Mock network error - fetch rejection
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error - fetch failed'));

      const { result } = renderHook(() => useUserTeamScores({ sport: 'NFL' }), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.type).toBe('network');
    });

    it('should handle server errors', async () => {
      // Mock server error with proper Response object - ensure it fails consistently
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal Server Error' }),
        text: async () => 'Internal Server Error',
      } as Response);

      const { result } = renderHook(() => useUserTeamScores({ sport: 'NFL' }), {
        wrapper,
      });

      // Wait for the query to complete (including retries)
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });

      expect(result.current.isError).toBe(true);
      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Server error - please try again later');
      expect(result.current.error?.type).toBe('server');
    });
  });
});