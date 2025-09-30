import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ChevronUp, ChevronDown } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Sport = "NBA" | "NFL" | "MLB" | "NHL";

const TEAMS: Record<Sport, string[]> = {
  NBA: ["Warriors", "Lakers", "Celtics", "Bulls"],
  NFL: ["49ers", "Cowboys", "Patriots", "Packers"],
  MLB: ["Giants", "Yankees", "Red Sox", "Dodgers"],
  NHL: ["Sharks", "Bruins", "Maple Leafs", "Canadiens"],
};

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [selectedSports, setSelectedSports] = useState<Sport[]>([]);
  const [orderedSports, setOrderedSports] = useState<Sport[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<Record<Sport, string[]>>({
    NBA: [],
    NFL: [],
    MLB: [],
    NHL: [],
  });
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

  // Step 3: Toggle team selection
  const toggleTeam = (sport: Sport, team: string) => {
    const teams = selectedTeams[sport];
    if (teams.includes(team)) {
      setSelectedTeams({
        ...selectedTeams,
        [sport]: teams.filter((t) => t !== team),
      });
    } else {
      setSelectedTeams({
        ...selectedTeams,
        [sport]: [...teams, team],
      });
    }
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
      const favoriteTeams = orderedSports.flatMap((sport) => selectedTeams[sport]);

      // Create profile with favorite sports and teams
      await apiRequest("POST", "/api/profile", {
        firebaseUid: user.uid,
        firstName,
        lastName,
        favoriteSports: orderedSports,
        favoriteTeams,
      });

      // Mark onboarding as complete
      await apiRequest("PUT", `/api/profile/${user.uid}/onboarding`);

      // Invalidate profile cache
      await queryClient.invalidateQueries({ queryKey: ["/api/profile", user.uid] });

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
                {(["NBA", "NFL", "MLB", "NHL"] as Sport[]).map((sport) => (
                  <div key={sport} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sport-${sport}`}
                      checked={selectedSports.includes(sport)}
                      onCheckedChange={() => toggleSport(sport)}
                      data-testid={`checkbox-sport-${sport.toLowerCase()}`}
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
              {orderedSports.map((sport) => (
                <div key={sport} className="space-y-3">
                  <h4 className="font-medium">{sport}</h4>
                  <div className="space-y-2">
                    {TEAMS[sport].map((team) => (
                      <div key={team} className="flex items-center space-x-2">
                        <Checkbox
                          id={`team-${sport}-${team}`}
                          checked={selectedTeams[sport].includes(team)}
                          onCheckedChange={() => toggleTeam(sport, team)}
                          data-testid={`checkbox-team-${sport.toLowerCase()}-${team.toLowerCase().replace(/\s+/g, '-')}`}
                        />
                        <Label
                          htmlFor={`team-${sport}-${team}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {team}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
