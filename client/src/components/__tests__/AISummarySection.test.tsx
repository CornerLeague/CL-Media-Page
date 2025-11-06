import React from 'react';
import '@testing-library/jest-dom';
import type { Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AISummarySection } from '../AISummarySection';

// Mock SportContext
vi.mock('@/contexts/SportContext', () => ({
  useSport: vi.fn(() => ({
    selectedSport: 'NFL',
    isTransitioning: false,
    lastSportChange: Date.now(),
    // Fields consumed by ScoresWidget
    isRefreshing: false,
    isSportChanging: false,
    loadingProgress: undefined,
    loadingState: { isLoading: false, progress: 0, message: '' },
    errorHandler: { error: null, retry: vi.fn() },
  })),
}));

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-1', name: 'Test User' },
  })),
}));

// Build test games for hook
const cowboysLiveGame = {
  gameId: 'g1',
  status: 'live',
  period: 'Q2',
  timeRemaining: '05:12',
  homeTeam: 'Dallas Cowboys',
  awayTeam: 'New York Giants',
  homeScore: 14,
  awayScore: 10,
  startTime: new Date().toISOString(),
};

const cowboysFinalGame = {
  gameId: 'g2',
  status: 'final',
  homeTeam: 'Dallas Cowboys',
  awayTeam: 'Philadelphia Eagles',
  homeScore: 24,
  awayScore: 17,
  startTime: new Date(Date.now() - 86400000).toISOString(),
};

const giantsScheduledGame = {
  gameId: 'g3',
  status: 'scheduled',
  homeTeam: 'New York Giants',
  awayTeam: 'Dallas Cowboys',
  startTime: new Date(Date.now() + 86400000).toISOString(),
};

// Mock useUserTeamScores hook
vi.mock('@/hooks/useUserTeamScores', () => ({
  useUserTeamScores: vi.fn(() => {
    const games = [cowboysLiveGame, cowboysFinalGame];
    return {
      data: { games, lastUpdated: new Date().toISOString() },
      isLoading: false,
      error: null,
      isWebSocketConnected: true,
      webSocketState: 'connected',
      refetch: vi.fn(),
      hasLiveGames: games.some(g => g.status === 'live'),
      hasScheduledGames: false,
      getGamesByStatus: (status: 'live' | 'final' | 'scheduled') => games.filter(g => g.status === status),
      getUserTeamGames: () => games.filter(g => g.homeTeam === 'Dallas Cowboys' || g.awayTeam === 'Dallas Cowboys'),
      subscribeToRealTimeUpdates: vi.fn(),
    };
  }),
}));

// Utility to render with QueryClient
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AISummarySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure fetch returns a profile with favorite teams
    (global.fetch as unknown as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ favoriteTeams: ['Dallas Cowboys', 'New York Giants'] }),
    } as Response);
  });

  it('displays current user team name and live updates badge', async () => {
    renderWithClient(<AISummarySection />);

    await waitFor(() => {
      // Team name uses the last word uppercased (Dallas Cowboys -> COWBOYS)
      expect(screen.getByTestId('text-team-name')).toHaveTextContent('COWBOYS');
    });

    // Shows live updates when websocket connected (may appear in multiple places)
    expect(screen.getAllByText(/live updates/i).length).toBeGreaterThan(0);
    // Shows LIVE pulse badge when hasLiveGames
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows navigation buttons for multiple favorite teams and cycles next', async () => {
    renderWithClient(<AISummarySection />);

    const nextBtn = await screen.findByTestId('button-next-team');
    expect(nextBtn).toBeInTheDocument();

    // Initial team is Cowboys
    expect(screen.getByTestId('text-team-name')).toHaveTextContent('COWBOYS');

    // Navigate to next team (Giants)
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByTestId('text-team-name')).toHaveTextContent('GIANTS');
    });
  });

  it('generates AI summary based on live game when present', async () => {
    renderWithClient(<AISummarySection />);

    await waitFor(() => {
      const summary = screen.getByTestId('text-ai-summary');
      expect(summary.textContent || '').toMatch(/is currently playing live/i);
    });
  });
});
// Mock React Query's useQuery to return a profile with favoriteTeams
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: { favoriteTeams: ['Dallas Cowboys', 'New York Giants'] } })),
  };
});