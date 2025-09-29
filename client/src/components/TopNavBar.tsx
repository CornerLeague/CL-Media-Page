import { ThemeToggle } from './ThemeToggle';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const TopNavBar = () => {
  return (
    <nav className="w-full border-b border-border/20 bg-background/80 backdrop-blur-sm sticky top-0 z-50" data-testid="nav-top">
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <Select defaultValue="nba">
            <SelectTrigger 
              className="w-auto h-auto border-0 bg-transparent p-0 gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0 font-display font-bold text-base sm:text-lg text-foreground"
              data-testid="select-sport-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent data-testid="select-sport-content">
              <SelectItem value="nba" data-testid="option-nba">NBA</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 sm:h-10 sm:w-10 p-0"
              data-testid="button-profile"
              onClick={() => console.log('Profile clicked')}
            >
              <User className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="sr-only">Profile</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};
