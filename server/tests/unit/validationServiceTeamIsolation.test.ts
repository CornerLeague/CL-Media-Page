import { describe, it, expect } from 'vitest';
import { ValidationService } from '../../agents/validationService';
import type { GameScore } from '../../agents/types';

describe('ValidationService - Team Isolation', () => {
  it('keeps only games involving requested teamIds', () => {
    const svc = new ValidationService();
    const now = new Date();

    const scores: GameScore[] = [
      {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 80,
        awayPts: 77,
        status: 'in_progress',
        period: '3',
        timeRemaining: '6:21',
        startTime: now,
        source: 'ESPN',
      },
      {
        gameId: 'NBA_2025_01_NYK_MIA',
        homeTeamId: 'NBA_NYK',
        awayTeamId: 'NBA_MIA',
        homePts: 40,
        awayPts: 45,
        status: 'in_progress',
        period: '2',
        timeRemaining: '7:47',
        startTime: now,
        source: 'CBS',
      },
    ];

    const res = svc.validateForTeams(scores, ['NBA_LAL']);
    expect(res.items.length).toBe(1);
    const g = res.items[0];
    expect(g.homeTeamId === 'NBA_LAL' || g.awayTeamId === 'NBA_LAL').toBe(true);
  });
});