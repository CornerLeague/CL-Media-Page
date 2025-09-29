import { NewsArticle } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NewsCardProps {
  article: NewsArticle;
  onClick?: () => void;
  showTeamBadge?: boolean;
  teamName?: string;
}

export const NewsCard = ({ article, onClick, showTeamBadge = false, teamName }: NewsCardProps) => {
  const getCategoryColor = (category: NewsArticle['category']) => {
    switch (category) {
      case 'injuries':
        return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'roster':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400 border-blue-200 dark:border-blue-800';
      case 'trade':
        return 'text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400 border-purple-200 dark:border-purple-800';
      case 'general':
        return 'text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400 border-gray-200 dark:border-gray-800';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400 border-gray-200 dark:border-gray-800';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div
      className="flex-shrink-0 w-80 bg-card rounded-lg border border-border/20 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="p-4">
        {/* Header with category, team, and time */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-xs ${getCategoryColor(article.category)}`}
            >
              {article.category.charAt(0).toUpperCase() + article.category.slice(1)}
            </Badge>
            {showTeamBadge && teamName && (
              <Badge variant="secondary" className="text-xs">
                {teamName}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatTimeAgo(article.published_at)}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-display font-semibold text-sm text-foreground leading-tight mb-2 line-clamp-2">
          {article.title}
        </h3>

        {/* Summary */}
        {article.summary && (
          <p className="font-body text-xs text-muted-foreground leading-relaxed line-clamp-3 mb-3">
            {article.summary}
          </p>
        )}

        {/* External link indicator */}
        {article.url && (
          <div className="flex items-center justify-end">
            <ExternalLink className="w-3 h-3 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
};