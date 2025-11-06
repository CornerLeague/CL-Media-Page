import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { useUserTeamScores } from '../useUserTeamScores';
// Mock AuthContext to satisfy hook requirements
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'user-1' }, token: 'test-token', isAuthenticated: true })),
}));
// Mock useScoreUpdateService to avoid WebSocketContext dependency
vi.mock('@/hooks/useScoreUpdateService', () => ({
  useScoreUpdateService: vi.fn(() => ({
    processUpdate: vi.fn(),
    getStatus: vi.fn(() => ({ lastProcessedTime: Date.now() })),
  })),
}));

// Utility wrapper with QueryClient
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useUserTeamScores - sport change refetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure React Query considers app online
    onlineManager.setOnline(true);
    (global.fetch as unknown as Mock).mockReset();
    (global.fetch as unknown as Mock).mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      const params = new URL(url, 'http://localhost').searchParams;
      const sport = params.get('sport') || 'nfl';
      const payload = {
        games: [
          {
            gameId: `${sport}-game-1`,
            sport,
            homeTeam: 'Dallas Cowboys',
            awayTeam: 'New York Giants',
            homeScore: 14,
            awayScore: 10,
            status: 'live',
            startTime: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            isUserTeamGame: true,
          },
        ],
        userProfile: { id: 'user-1', favoriteTeams: [] },
        lastUpdated: new Date().toISOString(),
        totalGames: 1,
        liveGames: 1,
        completedGames: 0,
        scheduledGames: 0,
      };
      return {
        ok: true,
        json: async () => payload,
        status: 200,
      } as Response;
    });
  });

  it('refetches with new sport and updates query URL parameters', async () => {
    const wrapper = createWrapper();

    const { rerender, result } = renderHook(
      (props: { sport: string }) =>
        useUserTeamScores({ sport: props.sport as any, limit: 5, enableRealTimeUpdates: false }),
      { initialProps: { sport: 'nfl' }, wrapper }
    );

    // Manually trigger fetch to avoid debounce/race conditions
    result.current.refetch();

    // First fetch for NFL
    await waitFor(() => {
      expect((global.fetch as unknown as Mock).mock.calls.length).toBeGreaterThan(0);
    });

    // Change sport to NBA; due to debounce, advance timers
    rerender({ sport: 'nba' });
    // Wait for internal debounce to update options
    await new Promise(res => setTimeout(res, 350));
    // Trigger refetch for updated sport
    result.current.refetch();

    await waitFor(() => {
      expect((global.fetch as unknown as Mock).mock.calls.length).toBeGreaterThan(1);
    });

    const lastCallArgs = (global.fetch as unknown as Mock).mock.calls.at(-1) as [RequestInfo];
    const lastUrl = String(lastCallArgs[0]);
    expect(lastUrl).toMatch(/sport=nba/);

    // No fake timers used
  });
});