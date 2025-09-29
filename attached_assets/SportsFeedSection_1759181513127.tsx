import { useState } from "react";
import { NewsCard } from "./NewsCard";
import { ChevronDown } from "lucide-react";
import { NewsArticle, TeamDashboard } from '@/lib/api-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from '@/components/ui/skeleton';

interface SportsFeedSectionProps {
  teamDashboard?: TeamDashboard;
  isLoading?: boolean;
  error?: Error | null;
}

export const SportsFeedSection = ({ teamDashboard, isLoading, error }: SportsFeedSectionProps) => {
  const [selectedCategory, setSelectedCategory] = useState<NewsArticle['category'] | 'all'>('all');
  const { toast } = useToast();

  const handleCategorySelect = (category: NewsArticle['category'] | 'all') => {
    setSelectedCategory(category);
    toast({
      title: "Category Updated",
      description: `Now showing ${category === 'all' ? 'all' : category.toLowerCase()} content`,
    });
  };

  const filteredNews = teamDashboard?.news?.filter(article =>
    selectedCategory === 'all' || article.category === selectedCategory
  ) || [];

  const categories: Array<{ value: NewsArticle['category'] | 'all'; label: string }> = [
    { value: 'all', label: 'All Stories' },
    { value: 'injuries', label: 'Injuries' },
    { value: 'roster', label: 'Roster Moves' },
    { value: 'trade', label: 'Trade News' },
    { value: 'general', label: 'General' },
  ];

  const handleNewsClick = (article: NewsArticle) => {
    if (article.url) {
      window.open(article.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section className="w-full">
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        {/* Category Filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <h2 className="font-display font-semibold text-base text-foreground mb-4 mt-20 flex items-center gap-2 cursor-pointer hover:text-primary transition-colors">
              {categories.find(cat => cat.value === selectedCategory)?.label || 'All Stories'}
              <ChevronDown className="w-4 h-4" />
            </h2>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {categories.map(category => (
              <DropdownMenuItem
                key={category.value}
                onClick={() => handleCategorySelect(category.value)}
              >
                {category.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 sm:gap-4 px-4 sm:px-6 md:px-8 lg:px-12 pb-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex-shrink-0 w-80">
                <Skeleton className="h-40 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="px-4 sm:px-6 md:px-8 lg:px-12 pb-4">
          <div className="text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 p-4 rounded-lg border">
            <p className="text-sm">Unable to load news</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        </div>
      )}

      {/* News Feed */}
      {!isLoading && !error && (
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 sm:gap-4 px-4 sm:px-6 md:px-8 lg:px-12 pb-4">
            {filteredNews.length > 0 ? (
              filteredNews.map(article => (
                <NewsCard
                  key={article.id}
                  article={article}
                  onClick={() => handleNewsClick(article)}
                />
              ))
            ) : (
              <div className="flex-shrink-0 w-80 bg-card rounded-lg border border-border/20 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No news articles available
                  {selectedCategory !== 'all' && ` for ${selectedCategory}`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};