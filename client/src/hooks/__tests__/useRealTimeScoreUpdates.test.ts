import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRealTimeScoreUpdates } from '../useRealTimeScoreUpdates';
import { useWebSocket } from '../useWebSocket';
import type { UserTeamScoreUpdate, UserTeamStatusChange } from '../useWebSocket';

// Mock the useWebSocket hook
jest.mock('../useWebSocket');
const mockUseWebSocket = useWebSocket as jest.MockedFunction<typeof useWebSocket>;

// Mock audio context
const mockAudioContext = {
  createOscillator: jest.fn(() => ({
    connect: jest.fn(),
    frequency: { setValueAtTime: jest.fn() },
    type: 'sine',
    start: jest.fn(),
    stop: jest.fn(),
  })),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      exponentialRampToValueAtTime: jest.fn(),
    },
  })),
  destination: {},
  currentTime: 0,
  close: jest.fn(),
};

// Mock Notification API
const mockNotification = jest.fn();
Object.defineProperty(window, 'Notification', {
  value: mockNotification,
  configurable: true,
});
Object.defineProperty(window.Notification, 'permission', {
  value: 'granted',
  configurable: true,
});
Object.defineProperty(window.Notification, 'requestPermission', {
  value: jest.fn().mockResolvedValue('granted'),
  configurable: true,
});

// Mock AudioContext
Object.defineProperty(window, 'AudioContext', {
  value: jest.fn(() => mockAudioContext),
  configurable: true,
});

describe('useRealTimeScoreUpdates', () => {
  let queryClient: QueryClient;
  let mockWebSocketReturn: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    mockWebSocketReturn = {
      isConnected: false,
      state: 'disconnected',
      connect: jest.fn(),
      disconnect: jest.fn(),
      subscribeToUserTeams: jest.fn(),
      unsubscribeFromUserTeams: jest.fn(),
    };

    mockUseWebSocket.mockReturnValue(mockWebSocketReturn);

    // Clear all mocks
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionState).toBe('disconnected');
      expect(result.current.updateHistory).toEqual([]);
      expect(result.current.updateStats.totalUpdates).toBe(0);
      expect(result.current.updateStats.scoreUpdates).toBe(0);
      expect(result.current.updateStats.statusChanges).toBe(0);
      expect(result.current.lastUpdate).toBeNull();
    });

    it('should initialize WebSocket with correct options', () => {
      renderHook(() => useRealTimeScoreUpdates({
        sports: ['football', 'basketball'],
        enableNotifications: true,
        enableSoundAlerts: true,
      }), { wrapper });

      expect(mockUseWebSocket).toHaveBeenCalledWith({
        autoConnect: true,
        autoReconnect: true,
        maxReconnectAttempts: 10,
        eventHandlers: expect.objectContaining({
          onScoreUpdate: expect.any(Function),
          onStatusChange: expect.any(Function),
          onSubscriptionConfirmation: expect.any(Function),
        }),
      });
    });
  });

  describe('connection management', () => {
    it('should update connection stats when connected', async () => {
      const { result, rerender } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      // Simulate connection
      mockWebSocketReturn.isConnected = true;
      mockWebSocketReturn.state = 'connected';
      
      rerender();

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
        expect(result.current.connectionState).toBe('connected');
        expect(result.current.updateStats.connectedSince).toBeTruthy();
      });
    });

    it('should clear connection stats when disconnected', async () => {
      const { result, rerender } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      // First connect
      mockWebSocketReturn.isConnected = true;
      mockWebSocketReturn.state = 'connected';
      rerender();

      await waitFor(() => {
        expect(result.current.updateStats.connectedSince).toBeTruthy();
      });

      // Then disconnect
      mockWebSocketReturn.isConnected = false;
      mockWebSocketReturn.state = 'disconnected';
      rerender();

      await waitFor(() => {
        expect(result.current.updateStats.connectedSince).toBeNull();
      });
    });
  });

  describe('score updates', () => {
    it('should handle score updates correctly', async () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates({
        enableNotifications: true,
        enableSoundAlerts: true,
      }), { wrapper });

      const mockScoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          sport: 'football',
          gameData: {
            gameId: 'game-123',
            homeTeam: 'Team A',
            awayTeam: 'Team B',
            homeScore: 14,
            awayScore: 7,
            status: 'live',
            quarter: 2,
            timeRemaining: '10:30',
          },
          isUserTeam: true,
          timestamp: new Date().toISOString(),
        },
      };

      // Get the event handler that was passed to useWebSocket
      const eventHandlers = mockUseWebSocket.mock.calls[0][0].eventHandlers;
      
      act(() => {
        eventHandlers.onScoreUpdate(mockScoreUpdate);
      });

      await waitFor(() => {
        expect(result.current.updateStats.totalUpdates).toBe(1);
        expect(result.current.updateStats.scoreUpdates).toBe(1);
        expect(result.current.updateHistory).toHaveLength(1);
        expect(result.current.lastUpdate).toMatchObject({
          type: 'score-update',
          gameId: 'game-123',
          sport: 'football',
        });
      });

      // Verify notification was shown
      expect(mockNotification).toHaveBeenCalledWith(
        'Score Update!',
        expect.objectContaining({
          body: 'Team A 14 - 7 Team B',
        })
      );
    });

    it('should throttle multiple updates', async () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates({
        updateThrottleMs: 100,
      }), { wrapper });

      const eventHandlers = mockUseWebSocket.mock.calls[0][0].eventHandlers;
      
      const createScoreUpdate = (gameId: string) => ({
        type: 'user-team-score-update' as const,
        payload: {
          sport: 'football' as const,
          gameData: {
            gameId,
            homeTeam: 'Team A',
            awayTeam: 'Team B',
            homeScore: 14,
            awayScore: 7,
            status: 'live' as const,
            quarter: 2,
            timeRemaining: '10:30',
          },
          isUserTeam: true,
          timestamp: new Date().toISOString(),
        },
      });

      // Send multiple updates quickly
      act(() => {
        eventHandlers.onScoreUpdate(createScoreUpdate('game-1'));
        eventHandlers.onScoreUpdate(createScoreUpdate('game-2'));
        eventHandlers.onScoreUpdate(createScoreUpdate('game-3'));
      });

      // Should still be 0 immediately due to throttling
      expect(result.current.updateStats.totalUpdates).toBe(0);

      // Wait for throttle to complete
      await waitFor(() => {
        expect(result.current.updateStats.totalUpdates).toBe(3);
      }, { timeout: 200 });
    });
  });

  describe('status changes', () => {
    it('should handle status changes correctly', async () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      const mockStatusChange: UserTeamStatusChange = {
        type: 'user-team-status-change',
        payload: {
          gameId: 'game-123',
          oldStatus: 'scheduled',
          newStatus: 'live',
          timestamp: new Date().toISOString(),
        },
      };

      const eventHandlers = mockUseWebSocket.mock.calls[0][0].eventHandlers;
      
      act(() => {
        eventHandlers.onStatusChange(mockStatusChange);
      });

      await waitFor(() => {
        expect(result.current.updateStats.totalUpdates).toBe(1);
        expect(result.current.updateStats.statusChanges).toBe(1);
        expect(result.current.lastUpdate).toMatchObject({
          type: 'status-change',
          gameId: 'game-123',
        });
      });
    });
  });

  describe('control functions', () => {
    it('should provide working control functions', () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      // Test connect/disconnect
      act(() => {
        result.current.connect();
      });
      expect(mockWebSocketReturn.connect).toHaveBeenCalled();

      act(() => {
        result.current.disconnect();
      });
      expect(mockWebSocketReturn.disconnect).toHaveBeenCalled();

      // Test sport subscriptions
      act(() => {
        result.current.subscribeToSport('football');
      });
      expect(mockWebSocketReturn.subscribeToUserTeams).toHaveBeenCalledWith('football');

      act(() => {
        result.current.unsubscribeFromSport('basketball');
      });
      expect(mockWebSocketReturn.unsubscribeFromUserTeams).toHaveBeenCalledWith('basketball');

      // Test all teams subscription
      act(() => {
        result.current.subscribeToAllUserTeams();
      });
      expect(mockWebSocketReturn.subscribeToUserTeams).toHaveBeenCalledWith();

      act(() => {
        result.current.unsubscribeFromAllUserTeams();
      });
      expect(mockWebSocketReturn.unsubscribeFromUserTeams).toHaveBeenCalledWith();
    });

    it('should clear update history', async () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      // Add some updates first
      const eventHandlers = mockUseWebSocket.mock.calls[0][0].eventHandlers;
      const mockUpdate = {
        type: 'user-team-score-update' as const,
        payload: {
          sport: 'football' as const,
          gameData: {
            gameId: 'game-123',
            homeTeam: 'Team A',
            awayTeam: 'Team B',
            homeScore: 14,
            awayScore: 7,
            status: 'live' as const,
            quarter: 2,
            timeRemaining: '10:30',
          },
          isUserTeam: true,
          timestamp: new Date().toISOString(),
        },
      };

      act(() => {
        eventHandlers.onScoreUpdate(mockUpdate);
      });

      await waitFor(() => {
        expect(result.current.updateStats.totalUpdates).toBe(1);
      });

      // Clear history
      act(() => {
        result.current.clearUpdateHistory();
      });

      expect(result.current.updateHistory).toEqual([]);
      expect(result.current.updateStats.totalUpdates).toBe(0);
      expect(result.current.lastUpdate).toBeNull();
    });
  });

  describe('notification controls', () => {
    it('should enable and disable notifications', () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      act(() => {
        result.current.enableNotifications();
      });

      act(() => {
        result.current.disableNotifications();
      });

      // These functions should execute without error
      expect(result.current.enableNotifications).toBeDefined();
      expect(result.current.disableNotifications).toBeDefined();
    });

    it('should enable and disable sound alerts', () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates(), { wrapper });

      act(() => {
        result.current.enableSoundAlerts();
      });

      act(() => {
        result.current.disableSoundAlerts();
      });

      // These functions should execute without error
      expect(result.current.enableSoundAlerts).toBeDefined();
      expect(result.current.disableSoundAlerts).toBeDefined();
    });
  });

  describe('auto-subscription', () => {
    it('should auto-subscribe to specified sports when connected', async () => {
      const { rerender } = renderHook(() => useRealTimeScoreUpdates({
        sports: ['football', 'basketball'],
      }), { wrapper });

      // Simulate connection
      mockWebSocketReturn.isConnected = true;
      rerender();

      await waitFor(() => {
        expect(mockWebSocketReturn.subscribeToUserTeams).toHaveBeenCalledWith('football');
        expect(mockWebSocketReturn.subscribeToUserTeams).toHaveBeenCalledWith('basketball');
      });
    });
  });

  describe('update history management', () => {
    it('should limit update history to maxUpdateHistory', async () => {
      const { result } = renderHook(() => useRealTimeScoreUpdates({
        maxUpdateHistory: 2,
      }), { wrapper });

      const eventHandlers = mockUseWebSocket.mock.calls[0][0].eventHandlers;
      
      const createUpdate = (gameId: string) => ({
        type: 'user-team-score-update' as const,
        payload: {
          sport: 'football' as const,
          gameData: {
            gameId,
            homeTeam: 'Team A',
            awayTeam: 'Team B',
            homeScore: 14,
            awayScore: 7,
            status: 'live' as const,
            quarter: 2,
            timeRemaining: '10:30',
          },
          isUserTeam: true,
          timestamp: new Date().toISOString(),
        },
      });

      // Add 3 updates
      act(() => {
        eventHandlers.onScoreUpdate(createUpdate('game-1'));
        eventHandlers.onScoreUpdate(createUpdate('game-2'));
        eventHandlers.onScoreUpdate(createUpdate('game-3'));
      });

      await waitFor(() => {
        expect(result.current.updateHistory).toHaveLength(2);
        expect(result.current.updateStats.totalUpdates).toBe(3);
      });
    });
  });
});