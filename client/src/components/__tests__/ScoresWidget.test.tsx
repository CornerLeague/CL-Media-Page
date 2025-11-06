import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoresWidget } from '../ScoresWidget';

// Mock SportContext used inside ScoresWidget
vi.mock('@/contexts/SportContext', () => ({
  useSport: vi.fn(() => ({
    isTransitioning: false,
    isRefreshing: false,
    isSportChanging: false,
    loadingProgress: undefined,
    loadingState: { isLoading: false, progress: 0, message: '' },
    errorHandler: { error: null, retry: vi.fn() },
  })),
}));

describe('ScoresWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Your Team badge when isUserTeam is true', () => {
    render(
      <ScoresWidget
        latestScore={{
          status: 'FINAL',
          home: { id: 'DAL', name: 'Dallas Cowboys', pts: 21 },
          away: { id: 'NYG', name: 'New York Giants', pts: 17 },
        }}
        recentResults={[]}
        teamName={'Cowboys'}
        isUserTeam={true}
        isWebSocketConnected={true}
      />
    );

    expect(screen.getByText('Your Team')).toBeInTheDocument();
  });

  it('shows live status display in status badge for a LIVE game', () => {
    render(
      <ScoresWidget
        latestScore={{
          status: 'LIVE',
          period: 'Q2',
          timeRemaining: '05:12',
          home: { id: 'DAL', name: 'Dallas Cowboys', pts: 14 },
          away: { id: 'NYG', name: 'New York Giants', pts: 10 },
        }}
        recentResults={[]}
        teamName={'Cowboys'}
        isUserTeam={true}
        isWebSocketConnected={true}
      />
    );

    const statusBadge = screen.getByTestId('status-badge');
    expect(statusBadge).toHaveTextContent('Q2 05:12');
  });

  it('renders error card and triggers retry when error provided', () => {
    const onRetry = vi.fn();
    render(
      <ScoresWidget
        latestScore={undefined}
        recentResults={[]}
        teamName={'Cowboys'}
        isUserTeam={true}
        isWebSocketConnected={false}
        error={new Error('Failed to load')}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Unable to load scores')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sets aria-live polite for main widget container', () => {
    render(
      <ScoresWidget
        latestScore={{
          status: 'FINAL',
          home: { id: 'DAL', name: 'Dallas Cowboys', pts: 21 },
          away: { id: 'NYG', name: 'New York Giants', pts: 17 },
        }}
        recentResults={[]}
        teamName={'Cowboys'}
        isUserTeam={false}
        isWebSocketConnected={true}
      />
    );

    const widget = screen.getByTestId('scores-widget');
    expect(widget).toHaveAttribute('aria-live', 'polite');
  });
});