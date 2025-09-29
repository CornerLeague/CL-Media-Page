import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TopNavBar } from "@/components/TopNavBar";
import { AISummarySection } from "@/components/AISummarySection";
import { RecentUpdatesSection } from "@/components/RecentUpdatesSection";
import { FanExperiencesSection } from "@/components/FanExperiencesSection";

function App() {
  //todo: remove mock functionality
  // Mock team dashboard data
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

  //todo: remove mock functionality
  // Mock recent updates data
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
    },
    {
      id: '4',
      type: 'free_agency' as const,
      title: 'Free Agent Target Identified',
      description: 'Reports indicate the Warriors have identified a key free agent target for the upcoming off-season.',
      timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      source: 'Yahoo Sports'
    }
  ];

  //todo: remove mock functionality
  // Mock fan experiences data
  const mockExperiences = [
    {
      type: 'watch_party' as const,
      title: 'Warriors vs Lakers Watch Party',
      description: 'Join fellow fans for an exciting game night with food, drinks, and giveaways!',
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
    },
    {
      type: 'viewing' as const,
      title: 'Game Day Viewing Party',
      description: 'Watch the big game on our giant screens with fellow superfans.',
      location: 'Downtown Sports Lounge',
      start_time: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      attendees: 56
    }
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <TopNavBar />
            
            <main className="relative">
              {/* AI Summary Section - Hero area with featured team */}
              <AISummarySection teamDashboard={mockTeamDashboard} />

              {/* Recent Updates Section */}
              <RecentUpdatesSection updates={mockUpdates} />

              {/* Fan Experiences Section */}
              <FanExperiencesSection experiences={mockExperiences} />
            </main>

            <Toaster />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
