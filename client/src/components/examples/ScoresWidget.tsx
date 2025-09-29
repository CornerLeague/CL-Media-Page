import { ScoresWidget } from '../ScoresWidget';

export default function ScoresWidgetExample() {
  //todo: remove mock functionality
  const mockLatestScore = {
    status: 'FINAL',
    period: '4th',
    timeRemaining: '',
    home: {
      id: 'home-team',
      name: 'Lakers',
      pts: 108
    },
    away: {
      id: 'away-team',
      name: 'Warriors',
      pts: 115
    }
  };

  //todo: remove mock functionality
  const mockRecentResults = [
    { gameId: '1', result: 'W' as const, opponent: 'Celtics', diff: 12, date: '2025-01-20' },
    { gameId: '2', result: 'L' as const, opponent: 'Heat', diff: -5, date: '2025-01-18' },
    { gameId: '3', result: 'W' as const, opponent: 'Nets', diff: 8, date: '2025-01-16' },
  ];

  return (
    <div className="max-w-sm mx-auto p-4">
      <ScoresWidget 
        latestScore={mockLatestScore}
        recentResults={mockRecentResults}
        teamName="Warriors"
      />
    </div>
  );
}
