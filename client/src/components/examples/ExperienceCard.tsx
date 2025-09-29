import { ExperienceCard } from '../ExperienceCard';

export default function ExperienceCardExample() {
  //todo: remove mock functionality
  const mockExperience = {
    type: 'watch_party' as const,
    title: 'Warriors vs Lakers Watch Party',
    description: 'Join fellow fans for an exciting game night with food, drinks, and giveaways!',
    location: 'The Sports Bar & Grill',
    start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    attendees: 42
  };

  return (
    <div className="p-4">
      <ExperienceCard 
        experience={mockExperience}
        onClick={() => console.log('Experience clicked')}
      />
    </div>
  );
}
