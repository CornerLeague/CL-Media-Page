import { FanExperiencesSection } from '../FanExperiencesSection';

export default function FanExperiencesSectionExample() {
  //todo: remove mock functionality
  const mockExperiences = [
    {
      type: 'watch_party' as const,
      title: 'Warriors vs Lakers Watch Party',
      description: 'Join fellow fans for an exciting game night with food and drinks!',
      location: 'The Sports Bar & Grill',
      start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      attendees: 42
    },
    {
      type: 'tailgate' as const,
      title: 'Pre-Game Tailgate BBQ',
      description: 'Bring your grill and join us for the ultimate tailgate experience.',
      location: 'Chase Center Parking Lot A',
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      attendees: 28
    },
    {
      type: 'meetup' as const,
      title: 'Warriors Fan Meetup',
      description: 'Connect with other passionate Warriors fans in your area.',
      location: 'Oakland Arena',
      start_time: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      attendees: 15
    }
  ];

  return <FanExperiencesSection experiences={mockExperiences} />;
}
