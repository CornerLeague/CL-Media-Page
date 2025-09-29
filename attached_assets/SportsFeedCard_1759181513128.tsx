import { Card } from "@/components/ui/card";

interface SportsFeedCardProps {
  title: string;
  description: string;
  image: string;
  time: string;
  category: string;
}

export const SportsFeedCard = ({ title, description, image, time, category }: SportsFeedCardProps) => {
  return (
    <Card className="w-72 sm:w-80 flex-shrink-0 overflow-hidden border-0 shadow-sm bg-white/10 backdrop-blur-md hover:bg-white/20 transition-all duration-normal">
      <div className="relative h-48 overflow-hidden">
        <img 
          src={image} 
          alt={title}
          className="w-full h-full object-cover transition-transform duration-normal hover:scale-105"
        />
        <div className="absolute top-3 left-3">
          <span className="px-2 py-1 text-xs font-medium font-body bg-primary text-primary-foreground rounded-md">
            {category}
          </span>
        </div>
      </div>
      
      <div className="p-4 space-y-2">
        <div className="flex justify-between items-start">
          <h3 className="font-display font-semibold text-sm text-foreground leading-tight line-clamp-2">
            {title}
          </h3>
        </div>
        
        <p className="text-muted-foreground font-body text-xs leading-relaxed line-clamp-2">
          {description}
        </p>
        
        <div className="pt-1">
          <span className="text-secondary text-xs font-body">{time}</span>
        </div>
      </div>
    </Card>
  );
};