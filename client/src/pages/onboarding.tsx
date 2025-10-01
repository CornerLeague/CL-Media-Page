import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { ChevronUp, ChevronDown, Check, ChevronsUpDown, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SPORTS, TEAMS_BY_SPORT, Sport, sportHasTeams, TeamSport } from "@/data/sportsTeams";
import { cn } from "@/lib/utils";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [selectedSports, setSelectedSports] = useState<Sport[]>([]);
  const [orderedSports, setOrderedSports] = useState<Sport[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Partial<Record<Sport, string[]>>>({});
  const [openDropdown, setOpenDropdown] = useState<Sport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Toggle sport selection
  const toggleSport = (sport: Sport) => {
    if (selectedSports.includes(sport)) {
      setSelectedSports(selectedSports.filter((s) => s !== sport));
    } else {
      setSelectedSports([...selectedSports, sport]);
    }
  };

  // Step 1: Move to step 2
  const handleStep1Next = () => {
    if (selectedSports.length === 0) {
      toast({
        title: "Selection Required",
        description: "Please select at least one sport.",
        variant: "destructive",
      });
      return;
    }
    setOrderedSports([...selectedSports]);
    setStep(2);
  };

  // Get sports that have teams from ordered sports
  const getSportsWithTeams = (): TeamSport[] => {
    return orderedSports.filter(sportHasTeams);
  };

  // Step 2: Reorder sports
  const moveUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...orderedSports];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setOrderedSports(newOrder);
  };

  const moveDown = (index: number) => {
    if (index === orderedSports.length - 1) return;
    const newOrder = [...orderedSports];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setOrderedSports(newOrder);
  };

  // Step 3: Toggle team selection (add or remove)
  const toggleTeam = (sport: Sport, team: string) => {
    setSelectedTeams((prev) => {
      const teams = prev[sport] || [];
      if (teams.includes(team)) {
        return {
          ...prev,
          [sport]: teams.filter((t) => t !== team),
        };
      } else {
        return {
          ...prev,
          [sport]: [...teams, team],
        };
      }
    });
  };

  // Submit onboarding data
  const handleFinish = async () => {
    if (!user?.uid) {
      toast({
        title: "Error",
        description: "User not authenticated.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Split displayName into firstName and lastName
      const displayName = user.displayName || "";
      const nameParts = displayName.trim().split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Flatten selectedTeams into a single array
      const favoriteTeams = orderedSports.flatMap((sport) => selectedTeams[sport] ?? []);

      // Create profile with favorite sports and teams
      await apiRequest("POST", "/api/profile", {
        firebaseUid: user.uid,
        firstName,
        lastName,
        favoriteSports: orderedSports,
        favoriteTeams,
      });

      // Mark onboarding as complete and get updated profile
      const updatedProfile = await apiRequest("PUT", `/api/profile/${user.uid}/onboarding`);

      // Immediately update cache with server response
      queryClient.setQueryData(["/api/profile"], updatedProfile);
      await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });

      toast({
        title: "Success",
        description: "Your preferences have been saved!",
      });

      // Navigate to home
      setLocation("/");
    } catch (error) {
      console.error("Error saving profile:", error);
      toast({
        title: "Error",
        description: "Failed to save your preferences. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Welcome! Let's personalize your experience</CardTitle>
          <CardDescription>Step {step}/3</CardDescription>
        </CardHeader>
        
        <CardContent className="min-h-[300px]">
          {/* Step 1: Select Sports */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" data-testid="text-step-title">Select Your Favorite Sports</h3>
              <p className="text-sm text-muted-foreground">Choose at least one sport you'd like to follow</p>
              <div className="space-y-3">
                {SPORTS.map((sport) => (
                  <div key={sport} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sport-${sport}`}
                      checked={selectedSports.includes(sport)}
                      onCheckedChange={() => toggleSport(sport)}
                      data-testid={`checkbox-sport-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    <Label
                      htmlFor={`sport-${sport}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {sport}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Order Sports */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold" data-testid="text-step-title">Order Your Sports</h3>
              <p className="text-sm text-muted-foreground">Arrange from most to least favorite</p>
              <div className="space-y-2">
                {orderedSports.map((sport, index) => (
                  <div
                    key={sport}
                    className="flex items-center justify-between p-3 bg-muted rounded-md"
                    data-testid={`sport-order-${sport.toLowerCase()}`}
                  >
                    <span className="font-medium">{sport}</span>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        data-testid={`button-move-up-${sport.toLowerCase()}`}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => moveDown(index)}
                        disabled={index === orderedSports.length - 1}
                        data-testid={`button-move-down-${sport.toLowerCase()}`}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Select Teams */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold" data-testid="text-step-title">Select Your Favorite Teams</h3>
              <p className="text-sm text-muted-foreground">Choose teams for each sport</p>
              {getSportsWithTeams().length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No team-based sports selected. Click Finish to complete your setup.</p>
                </div>
              ) : (
                <>
                  {getSportsWithTeams().map((sport) => {
                    const divisions = TEAMS_BY_SPORT[sport];
                    const sportTeams = selectedTeams[sport] || [];
                  
                  return (
                  <div key={sport} className="space-y-3">
                    <h4 className="font-semibold text-base">{sport}</h4>
                    
                    <Popover 
                      open={openDropdown === sport} 
                      onOpenChange={(open) => setOpenDropdown(open ? sport : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openDropdown === sport}
                          className="w-full justify-between"
                          data-testid={`button-select-teams-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          <span className="text-muted-foreground">
                            {sportTeams.length > 0 
                              ? `${sportTeams.length} team${sportTeams.length > 1 ? 's' : ''} selected`
                              : "Select teams..."}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput 
                            placeholder={`Search ${sport} teams...`}
                            data-testid={`input-search-teams-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                          />
                          <CommandList>
                            <CommandEmpty>No teams found.</CommandEmpty>
                            {Object.entries(divisions).map(([division, teams]) => (
                              <CommandGroup key={division} heading={division}>
                                {teams.map((team) => (
                                  <CommandItem
                                    key={team}
                                    value={team}
                                    onSelect={() => {
                                      toggleTeam(sport, team);
                                    }}
                                    data-testid={`option-team-${sport.toLowerCase().replace(/\s+/g, '-')}-${team.toLowerCase().replace(/\s+/g, '-')}`}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        sportTeams.includes(team) ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {team}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {/* Selected Teams */}
                    {sportTeams.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {sportTeams.map((team) => (
                          <Badge
                            key={team}
                            variant="secondary"
                            className="gap-1"
                            data-testid={`badge-team-${sport.toLowerCase().replace(/\s+/g, '-')}-${team.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {team}
                            <button
                              type="button"
                              onClick={() => toggleTeam(sport, team)}
                              className="ml-1 hover:bg-muted rounded-sm"
                              data-testid={`button-remove-team-${sport.toLowerCase().replace(/\s+/g, '-')}-${team.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    </div>
                  );
                  })}
                </>
              )}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            data-testid="button-back"
          >
            Back
          </Button>
          
          {step < 3 ? (
            <Button
              onClick={step === 1 ? handleStep1Next : () => setStep(step + 1)}
              data-testid="button-next"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              disabled={isSubmitting}
              data-testid="button-finish"
            >
              {isSubmitting ? "Saving..." : "Finish"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
