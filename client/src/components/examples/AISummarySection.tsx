import { AISummarySection } from '../AISummarySection';

export default function AISummarySectionExample() {
  //todo: remove mock functionality
  const mockTeamDashboard = {
    team: {
      id: 'gsw',
      name: 'Warriors'
    },
    summary: {
      text: 'The Warriors are on a three-game winning streak, led by Stephen Curry\'s exceptional performance averaging 32 points per game. The team\'s defensive intensity has notably improved, holding opponents to just 98 points in their last matchup.'
    },
    latestScore: {
      status: 'FINAL',
      period: '4th',
      timeRemaining: '',
      home: {
        id: 'gsw',
        name: 'Warriors',
        pts: 115
      },
      away: {
        id: 'lal',
        name: 'Lakers',
        pts: 108
      }
    },
    recentResults: [
      { gameId: '1', result: 'W' as const, opponent: 'Celtics', diff: 12, date: '2025-01-20' },
      { gameId: '2', result: 'L' as const, opponent: 'Heat', diff: -5, date: '2025-01-18' },
      { gameId: '3', result: 'W' as const, opponent: 'Nets', diff: 8, date: '2025-01-16' },
    ]
  };

  return <AISummarySection teamDashboard={mockTeamDashboard} />;
}
