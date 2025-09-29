import { FanExperience, ExperienceCard } from './ExperienceCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Star } from 'lucide-react';

interface FanExperiencesSectionProps {
  experiences?: FanExperience[];
  isLoading?: boolean;
  error?: Error | null;
}

export const FanExperiencesSection = ({ experiences, isLoading, error }: FanExperiencesSectionProps) => {
  const handleExperienceClick = (experience: FanExperience) => {
    console.log('Experience clicked:', experience);
  };

  if (error) {
    return (
      <section className="w-full mt-6 sm:mt-8" data-testid="section-fan-experiences">
        <div className="px-4 sm:px-6 md:px-8 lg:px-12">
          <div className="text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 p-4 rounded-lg border">
            <p className="text-sm">Unable to load fan experiences</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full mt-6 sm:mt-8" data-testid="section-fan-experiences">
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display font-semibold text-base text-foreground">
            Fan Experiences
          </h2>
        </div>
      </div>

      {/* Loading State */}
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

      {/* Fan Experiences */}
      {!isLoading && !error && (
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-3 sm:gap-4 px-4 sm:px-6 md:px-8 lg:px-12 pb-4">
            {experiences && experiences.length > 0 ? (
              experiences.map((experience, index) => (
                <ExperienceCard
                  key={`${experience.type}-${experience.title}-${index}`}
                  experience={experience}
                  onClick={() => handleExperienceClick(experience)}
                />
              ))
            ) : (
              <div className="w-72 sm:w-80 flex-shrink-0 bg-card rounded-lg border border-border/20 p-4 text-center">
                <Star className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No fan experiences available
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
