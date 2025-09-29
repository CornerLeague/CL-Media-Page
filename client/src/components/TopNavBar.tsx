import { ThemeToggle } from './ThemeToggle';

export const TopNavBar = () => {
  return (
    <nav className="w-full border-b border-border/20 bg-background/80 backdrop-blur-sm sticky top-0 z-50" data-testid="nav-top">
      <div className="px-4 sm:px-6 md:px-8 lg:px-12 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display font-bold text-lg text-foreground" data-testid="text-app-title">
            Sports Media
          </h1>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
};
