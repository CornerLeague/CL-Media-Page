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
      <div className="px-4 sm:px-6 md:px-8 lg:px-12 py-4">
        <div className="flex items-center justify-between">
          <Select defaultValue="nba">
            <SelectTrigger 
              className="w-auto h-auto border-0 bg-transparent p-0 gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0 font-display font-bold text-lg text-foreground"
              data-testid="select-sport-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent data-testid="select-sport-content">
              <SelectItem value="nba" data-testid="option-nba">NBA</SelectItem>
            </SelectContent>
          </Select>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0"
              data-testid="button-profile"
              onClick={() => console.log('Profile clicked')}
            >
              <User className="h-5 w-5" />
              <span className="sr-only">Profile</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
};
