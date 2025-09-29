import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Newspaper, Activity, ArrowRightLeft, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export interface Update {
  id: string;
  type: 'news' | 'injury' | 'trade' | 'free_agency';
  title: string;
  description?: string;
  timestamp: string;
  source?: string;
}

interface UpdateCardProps {
  update: Update;
  onClick?: () => void;
}

export const UpdateCard = ({ update, onClick }: UpdateCardProps) => {
  const getTypeIcon = (type: Update['type']) => {
    switch (type) {
      case 'news':
        return <Newspaper className="w-12 h-12 text-accent/40" />;
      case 'injury':
        return <Activity className="w-12 h-12 text-accent/40" />;
      case 'trade':
        return <ArrowRightLeft className="w-12 h-12 text-accent/40" />;
      case 'free_agency':
        return <UserPlus className="w-12 h-12 text-accent/40" />;
      default:
        return <Newspaper className="w-12 h-12 text-accent/40" />;
    }
  };

  const getTypeLabel = (type: Update['type']) => {
    switch (type) {
      case 'news':
        return 'News';
      case 'injury':
        return 'Injury Report';
      case 'trade':
        return 'Trade News';
      case 'free_agency':
        return 'Free Agency';
      default:
        return type;
    }
  };

  const getTypeBadgeColor = (type: Update['type']) => {
    switch (type) {
      case 'news':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400';
      case 'injury':
        return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400';
      case 'trade':
        return 'text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400';
      case 'free_agency':
        return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return timestamp;
    }
  };

  return (
    <Card
      className="w-72 sm:w-80 flex-shrink-0 overflow-hidden border-0 shadow-sm bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all duration-normal cursor-pointer"
      onClick={onClick}
      data-testid={`card-update-${update.type}`}
    >
      <div className="relative h-32 overflow-hidden bg-gradient-to-br from-accent/20 to-accent/5">
        <div className="absolute inset-0 flex items-center justify-center">
          {getTypeIcon(update.type)}
        </div>

        <div className="absolute top-3 right-3">
          <Badge
            variant="outline"
            className={`text-xs ${getTypeBadgeColor(update.type)}`}
            data-testid="badge-update-type"
          >
            {getTypeLabel(update.type)}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-display font-semibold text-sm text-foreground leading-tight" data-testid="text-update-title">
            {update.title}
          </h3>
        </div>

        {update.description && (
          <p className="text-xs text-muted-foreground font-body leading-relaxed line-clamp-3">
            {update.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-body" data-testid="text-update-time">
            {formatTimestamp(update.timestamp)}
          </span>
          {update.source && (
            <span className="font-body text-xs truncate max-w-[120px]">
              {update.source}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};
