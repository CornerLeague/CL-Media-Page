import { TicketDeal } from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, TrendingUp, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TicketDealCardProps {
  deal: TicketDeal;
  onClick?: () => void;
}

export const TicketDealCard = ({ deal, onClick }: TicketDealCardProps) => {
  const getDealScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400';
    return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400';
  };

  const getDealScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Great Deal';
    if (score >= 0.6) return 'Good Deal';
    return 'Fair Deal';
  };

  const formatGameDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  return (
    <Card
      className="w-72 sm:w-80 flex-shrink-0 overflow-hidden border-0 shadow-sm bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all duration-normal cursor-pointer"
      onClick={onClick}
    >
      <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
        <div className="absolute inset-0 flex items-center justify-center">
          <MapPin className="w-12 h-12 text-primary/40" />
        </div>

        {/* Price and Deal Score */}
        <div className="absolute top-3 right-3 space-y-1">
          <span className="block px-2 py-1 text-xs font-medium font-body bg-primary text-primary-foreground rounded-md">
            ${deal.price}
          </span>
          <Badge
            variant="outline"
            className={`text-xs ${getDealScoreColor(deal.deal_score)}`}
          >
            <TrendingUp className="w-3 h-3 mr-1" />
            {getDealScoreLabel(deal.deal_score)}
          </Badge>
        </div>

        {/* Provider */}
        <div className="absolute top-3 left-3">
          <Badge variant="secondary" className="text-xs">
            {deal.provider}
          </Badge>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-display font-semibold text-sm text-foreground leading-tight">
            Section {deal.section}
          </h3>
          <p className="text-muted-foreground font-body text-xs mt-1">
            {deal.provider} - Deal Score: {Math.round(deal.deal_score * 100)}%
          </p>
        </div>

        {/* Game Date */}
        {deal.game_date && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span className="font-body">{formatGameDate(deal.game_date)}</span>
          </div>
        )}

        {/* Quantity */}
        {deal.quantity && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-body">{deal.quantity} tickets available</span>
          </div>
        )}

        {/* External link indicator */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            View on {deal.provider}
          </span>
          <ExternalLink className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
};