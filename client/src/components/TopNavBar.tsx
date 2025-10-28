import { useLocation } from 'wouter';
import { ThemeToggle } from './ThemeToggle';
import { User, LogOut, Settings, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import type { Sport } from '@/data/sportsTeams';
import { useQuery } from '@tanstack/react-query';
import type { UserProfile } from '@shared/schema';

export const TopNavBar = () => {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();
  const { selectedSport, setSelectedSport, availableSports } = useSport();
  const { toast } = useToast();

  const { data: profile } = useQuery<UserProfile | null>({
    queryKey: ["/api/profile", String(user?.id ?? "")],
    enabled: !!user,
    queryFn: async ({ queryKey }) => {
      const url = queryKey.join("/") as string;
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return await res.json();
    },
  });

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: 'Signed out',
        description: 'You have been successfully signed out.',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to sign out.',
        variant: 'destructive',
      });
    }
  };

  const getUserInitials = () => {
    if (!user?.username) return 'U';
    return user.username[0].toUpperCase();
  };

  const handleSportChange = (value: string) => {
    setSelectedSport(value as Sport);
  };

  // Show dropdown only if user has favorite sports
  const showSportSelector = availableSports.length > 0;
  const isSettings = location === '/settings';

  return (
    <nav className="w-full border-b border-border/20 bg-background/80 backdrop-blur-sm sticky top-0 z-50" data-testid="nav-top">
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          {isSettings ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to Home"
              onClick={() => setLocation('/')}
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : (
            showSportSelector && selectedSport && (
              <Select value={selectedSport} onValueChange={handleSportChange}>
                <SelectTrigger 
                  className="w-auto h-auto border-0 bg-transparent p-0 gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0 font-display font-bold text-base sm:text-lg text-foreground"
                  data-testid="select-sport-trigger"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent data-testid="select-sport-content">
                  {availableSports.map((sport) => (
                    <SelectItem 
                      key={sport} 
                      value={sport}
                      data-testid={`option-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {sport}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          )}
          
          <div className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-9 w-9 sm:h-10 sm:w-10 rounded-full p-0"
                    data-testid="button-profile"
                  >
                    <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
                      <AvatarFallback>{getUserInitials()}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" data-testid="dropdown-profile">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{(profile?.firstName?.trim()?.split(/\s+/)[0]) || user.username || 'User'}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation('/settings')} data-testid="button-settings">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut} data-testid="button-signout">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 w-9 sm:h-10 sm:w-10 p-0"
                data-testid="button-profile"
                onClick={() => setLocation('/login')}
              >
                <User className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="sr-only">Profile</span>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};
