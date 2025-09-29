import { RecentUpdatesSection } from '../RecentUpdatesSection';

export default function RecentUpdatesSectionExample() {
  //todo: remove mock functionality
  const mockUpdates = [
    {
      id: '1',
      type: 'news' as const,
      title: 'Warriors Sign New Point Guard',
      description: 'The Golden State Warriors have officially signed veteran point guard Marcus Johnson to a two-year deal.',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      source: 'ESPN'
    },
    {
      id: '2',
      type: 'injury' as const,
      title: 'Stephen Curry Day-to-Day',
      description: 'Star guard Stephen Curry is listed as day-to-day with a minor ankle sprain sustained in last night\'s game.',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      source: 'The Athletic'
    },
    {
      id: '3',
      type: 'trade' as const,
      title: 'Warriors Exploring Trade Options',
      description: 'Sources say the Warriors are actively exploring trade possibilities to bolster their bench depth before the deadline.',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      source: 'Bleacher Report'
    }
  ];

  return (
    <RecentUpdatesSection 
      updates={mockUpdates}
      onCategoryChange={(category) => console.log('Category changed:', category)}
    />
  );
}
