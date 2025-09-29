import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Users, Calendar, MapPin } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

export interface FanExperience {
  type: 'watch_party' | 'tailgate' | 'viewing' | 'meetup';
  title: string;
  description?: string;
  location?: string;
  start_time: string;
  attendees?: number;
}

interface ExperienceCardProps {
  experience: FanExperience;
  onClick?: () => void;
}

export const ExperienceCard = ({ experience, onClick }: ExperienceCardProps) => {
  const getTypeIcon = (type: FanExperience['type']) => {
    switch (type) {
      case 'watch_party':
        return <Users className="w-12 h-12 text-accent/40" />;
      case 'tailgate':
        return <Star className="w-12 h-12 text-accent/40" />;
      case 'viewing':
        return <Users className="w-12 h-12 text-accent/40" />;
      case 'meetup':
        return <Users className="w-12 h-12 text-accent/40" />;
      default:
        return <Star className="w-12 h-12 text-accent/40" />;
    }
  };

  const getTypeLabel = (type: FanExperience['type']) => {
    switch (type) {
      case 'watch_party':
        return 'Watch Party';
      case 'tailgate':
        return 'Tailgate';
      case 'viewing':
        return 'Viewing';
      case 'meetup':
        return 'Meetup';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };

  const getTypeBadgeColor = (type: FanExperience['type']) => {
    switch (type) {
      case 'watch_party':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400';
      case 'tailgate':
        return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
      case 'viewing':
        return 'text-purple-600 bg-purple-50 dark:bg-purple-950 dark:text-purple-400';
      case 'meetup':
        return 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-950 dark:text-gray-400';
    }
  };

  const formatEventTime = (dateString: string) => {
    try {
      const eventDate = new Date(dateString);
      const now = new Date();

      // If event is today or within 24 hours, show relative time
      if (Math.abs(eventDate.getTime() - now.getTime()) < 24 * 60 * 60 * 1000) {
        return formatDistanceToNow(eventDate, { addSuffix: true });
      }

      // Otherwise show formatted date and time
      return format(eventDate, 'MMM d, h:mm a');
    } catch {
      return dateString;
    }
  };

  return (
    <Card
      className="w-72 sm:w-80 flex-shrink-0 overflow-hidden border-0 shadow-sm bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all duration-normal cursor-pointer"
      onClick={onClick}
      data-testid={`card-experience-${experience.type}`}
    >
      <div className="relative h-32 overflow-hidden bg-gradient-to-br from-accent/20 to-accent/5">
        <div className="absolute inset-0 flex items-center justify-center">
          {getTypeIcon(experience.type)}
        </div>

        {/* Event Type Badge */}
        <div className="absolute top-3 right-3">
          <Badge
            variant="outline"
            className={`text-xs ${getTypeBadgeColor(experience.type)}`}
            data-testid="badge-experience-type"
          >
            {getTypeLabel(experience.type)}
          </Badge>
        </div>

        {/* Attendees Count */}
        {experience.attendees && (
          <div className="absolute top-3 left-3">
            <div className="flex items-center gap-1 px-2 py-1 bg-background/80 rounded-md">
              <Users className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground" data-testid="text-attendees">
                {experience.attendees}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-display font-semibold text-sm text-foreground leading-tight" data-testid="text-experience-title">
            {experience.title}
          </h3>
          {experience.location && (
            <p className="text-muted-foreground font-body text-xs mt-1">
              {experience.location}
            </p>
          )}
        </div>

        {/* Description */}
        {experience.description && (
          <p className="text-xs text-muted-foreground font-body leading-relaxed line-clamp-2">
            {experience.description}
          </p>
        )}

        {/* Event Time */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3" />
          <span className="font-body" data-testid="text-event-time">{formatEventTime(experience.start_time)}</span>
        </div>

        {/* Location and Attendees */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {experience.location && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span className="font-body text-xs truncate max-w-[120px]">
                {experience.location}
              </span>
            </div>
          )}
          {experience.attendees && (
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span className="font-body text-xs">
                {experience.attendees} going
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
