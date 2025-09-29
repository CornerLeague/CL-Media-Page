import { useState } from 'react';
import { Update, UpdateCard } from './UpdateCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Newspaper, ChevronDown } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type UpdateCategory = 'Latest News' | 'Injuries' | 'Trade News' | 'Free Agency';

interface RecentUpdatesSectionProps {
  updates?: Update[];
  isLoading?: boolean;
  error?: Error | null;
  onCategoryChange?: (category: UpdateCategory) => void;
}

export const RecentUpdatesSection = ({ updates, isLoading, error, onCategoryChange }: RecentUpdatesSectionProps) => {
  const [selectedCategory, setSelectedCategory] = useState<UpdateCategory>('Latest News');

  const handleCategoryChange = (value: UpdateCategory) => {
    setSelectedCategory(value);
    onCategoryChange?.(value);
    console.log('Category changed to:', value);
  };

  const handleUpdateClick = (update: Update) => {
    console.log('Update clicked:', update);
  };

  if (error) {
    return (
      <section className="w-full mt-6 sm:mt-8" data-testid="section-recent-updates">
        <div className="px-4 sm:px-6 md:px-8 lg:px-12">
          <div className="text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 p-4 rounded-lg border">
            <p className="text-sm">Unable to load recent updates</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full mt-6 sm:mt-8" data-testid="section-recent-updates">
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display font-semibold text-base text-foreground">
            Recent Updates
          </h2>
          
          <Select value={selectedCategory} onValueChange={handleCategoryChange}>
            <SelectTrigger 
              className="w-auto h-auto border-0 bg-transparent p-0 gap-1 hover:bg-transparent focus:ring-0 focus:ring-offset-0"
              data-testid="select-category-trigger"
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </SelectTrigger>
            <SelectContent data-testid="select-category-content">
              <SelectItem value="Latest News" data-testid="option-latest-news">Latest News</SelectItem>
              <SelectItem value="Injuries" data-testid="option-injuries">Injuries</SelectItem>
              <SelectItem value="Trade News" data-testid="option-trade-news">Trade News</SelectItem>
              <SelectItem value="Free Agency" data-testid="option-free-agency">Free Agency</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && (
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 sm:gap-4 px-4 sm:px-6 md:px-8 lg:px-12 pb-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="w-72 sm:w-80 flex-shrink-0">
                <Skeleton className="h-48 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !error && (
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 sm:gap-4 px-4 sm:px-6 md:px-8 lg:px-12 pb-4">
            {updates && updates.length > 0 ? (
              updates.map((update) => (
                <UpdateCard
                  key={update.id}
                  update={update}
                  onClick={() => handleUpdateClick(update)}
                />
              ))
            ) : (
              <div className="w-72 sm:w-80 flex-shrink-0 bg-card rounded-lg border border-border/20 p-4 text-center">
                <Newspaper className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No updates available for {selectedCategory}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
