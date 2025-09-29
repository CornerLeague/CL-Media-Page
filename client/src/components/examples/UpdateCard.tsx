import { UpdateCard } from '../UpdateCard';

export default function UpdateCardExample() {
  //todo: remove mock functionality
  const mockUpdate = {
    id: '1',
    type: 'news' as const,
    title: 'Warriors Sign New Point Guard',
    description: 'The Golden State Warriors have officially signed veteran point guard Marcus Johnson to a two-year deal.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    source: 'ESPN'
  };

  return (
    <div className="p-4">
      <UpdateCard 
        update={mockUpdate}
        onClick={() => console.log('Update clicked')}
      />
    </div>
  );
}
