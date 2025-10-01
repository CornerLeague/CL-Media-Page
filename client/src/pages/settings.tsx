import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Lock, User as UserIcon, Edit2, Save, X, ChevronUp, ChevronDown, Check, ChevronsUpDown } from "lucide-react";
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SPORTS, TEAMS_BY_SPORT, Sport } from "@/data/sportsTeams";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@shared/schema";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Firebase auth state
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Edit mode state
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingSports, setIsEditingSports] = useState(false);
  const [isEditingTeams, setIsEditingTeams] = useState(false);

  // Edit values state
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editSports, setEditSports] = useState<Sport[]>([]);
  const [editTeams, setEditTeams] = useState<Partial<Record<Sport, string[]>>>({});
  const [openDropdown, setOpenDropdown] = useState<Sport | null>(null);

  // Fetch user profile
  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
    enabled: !!user?.uid,
  });

  // Check if user signed up with Google (provider ID will be "google.com")
  const isGoogleUser = user?.providerData?.some(provider => provider.providerId === "google.com");

  // Initialize edit values when entering edit mode
  const startEditingName = () => {
    setEditFirstName(profile?.firstName || "");
    setEditLastName(profile?.lastName || "");
    setIsEditingName(true);
  };

  const startEditingSports = () => {
    setEditSports((profile?.favoriteSports || []) as Sport[]);
    setIsEditingSports(true);
  };

  const startEditingTeams = () => {
    // Initialize sports list from profile
    setEditSports((profile?.favoriteSports || []) as Sport[]);
    
    // Build teams map from profile
    const teamsMap: Partial<Record<Sport, string[]>> = {};
    if (profile?.favoriteSports && profile?.favoriteTeams) {
      profile.favoriteSports.forEach(sportName => {
        const sport = sportName as Sport;
        const sportData = TEAMS_BY_SPORT[sport as keyof typeof TEAMS_BY_SPORT];
        if (sportData) {
          teamsMap[sport] = (profile.favoriteTeams || []).filter(team => 
            Object.values(sportData).flat().includes(team)
          );
        }
      });
    }
    setEditTeams(teamsMap);
    setIsEditingTeams(true);
  };

  // Save handlers
  const handleSaveName = async () => {
    if (!user?.uid || !editFirstName.trim() || !editLastName.trim()) {
      toast({
        title: "Error",
        description: "Please enter both first and last name.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("PATCH", `/api/profile/${user.uid}/name`, {
        firstName: editFirstName.trim(),
        lastName: editLastName.trim(),
      });
      const updated = await response.json();

      // Immediately update cache with server response
      queryClient.setQueryData(["/api/profile"], updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });

      toast({
        title: "Success",
        description: "Name updated successfully.",
      });

      setIsEditingName(false);
    } catch (error: any) {
      console.error("Error updating name:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update name.",
        variant: "destructive",
      });
    }
  };

  const handleSaveSports = async () => {
    if (!user?.uid) return;

    if (editSports.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one sport.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("PATCH", `/api/profile/${user.uid}/sports`, {
        favoriteSports: editSports,
      });
      const updated = await response.json();

      // Immediately update cache with server response
      queryClient.setQueryData(["/api/profile"], updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });

      toast({
        title: "Success",
        description: "Favorite sports updated successfully.",
      });

      setIsEditingSports(false);
    } catch (error: any) {
      console.error("Error updating sports:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update sports.",
        variant: "destructive",
      });
    }
  };

  const handleSaveTeams = async () => {
    if (!user?.uid) return;

    // Flatten teams from all sports
    const allTeams = editSports.flatMap(sport => editTeams[sport] || []);

    try {
      const response = await apiRequest("PATCH", `/api/profile/${user.uid}/teams`, {
        favoriteTeams: allTeams,
      });
      const updated = await response.json();

      // Immediately update cache with server response
      queryClient.setQueryData(["/api/profile"], updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });

      toast({
        title: "Success",
        description: "Favorite teams updated successfully.",
      });

      setIsEditingTeams(false);
    } catch (error: any) {
      console.error("Error updating teams:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update teams.",
        variant: "destructive",
      });
    }
  };

  // Sport management
  const toggleSport = (sport: Sport) => {
    if (editSports.includes(sport)) {
      setEditSports(editSports.filter(s => s !== sport));
      // Remove teams for this sport
      const newTeams = { ...editTeams };
      delete newTeams[sport];
      setEditTeams(newTeams);
    } else {
      setEditSports([...editSports, sport]);
    }
  };

  const moveSportUp = (index: number) => {
    if (index === 0) return;
    const newOrder = [...editSports];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setEditSports(newOrder);
  };

  const moveSportDown = (index: number) => {
    if (index === editSports.length - 1) return;
    const newOrder = [...editSports];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setEditSports(newOrder);
  };

  // Team management
  const toggleTeam = (sport: Sport, team: string) => {
    setEditTeams((prev) => {
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

  // Firebase auth handlers
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !currentPasswordForEmail || !newEmail) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingEmail(true);
    
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPasswordForEmail);
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, newEmail);
      
      toast({
        title: "Success",
        description: "Email updated successfully.",
      });
      
      setNewEmail("");
      setCurrentPasswordForEmail("");
    } catch (error: any) {
      console.error("Error updating email:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update email.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingEmail(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !currentPasswordForPassword || !newPassword || !confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingPassword(true);
    
    try {
      const credential = EmailAuthProvider.credential(user.email!, currentPasswordForPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      
      toast({
        title: "Success",
        description: "Password updated successfully.",
      });
      
      setCurrentPasswordForPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Error updating password:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update password.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground" data-testid="text-loading">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-6">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
          <h1 className="text-3xl font-bold" data-testid="text-settings-title">Account Settings</h1>
        </div>

        <div className="max-w-4xl space-y-6">
          {/* Profile Information */}
          <Card data-testid="card-profile-info">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>Your account details</CardDescription>
              </div>
              {!isEditingName && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={startEditingName}
                  data-testid="button-edit-name"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditingName ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-first-name">First Name</Label>
                      <Input
                        id="edit-first-name"
                        value={editFirstName}
                        onChange={(e) => setEditFirstName(e.target.value)}
                        placeholder="First name"
                        data-testid="input-edit-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-last-name">Last Name</Label>
                      <Input
                        id="edit-last-name"
                        value={editLastName}
                        onChange={(e) => setEditLastName(e.target.value)}
                        placeholder="Last name"
                        data-testid="input-edit-last-name"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveName} data-testid="button-save-name">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingName(false)}
                      data-testid="button-cancel-name"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <p className="text-sm font-medium" data-testid="text-user-name">
                      {profile?.firstName && profile?.lastName 
                        ? `${profile.firstName} ${profile.lastName}` 
                        : user?.displayName || "Not set"}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <p className="text-sm font-medium" data-testid="text-user-email">{user?.email}</p>
                  </div>

                  {isGoogleUser && (
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground">
                        You signed in with Google. Email and password changes must be made through your Google account.
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Change Email - Only for non-Google users */}
          {!isGoogleUser && (
            <Card data-testid="card-change-email">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Change Email
                </CardTitle>
                <CardDescription>Update your email address</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateEmail} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-email">New Email</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="Enter new email"
                      data-testid="input-new-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="current-password-email">Current Password</Label>
                    <Input
                      id="current-password-email"
                      type="password"
                      value={currentPasswordForEmail}
                      onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                      placeholder="Enter current password"
                      data-testid="input-current-password-email"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isUpdatingEmail || !newEmail || !currentPasswordForEmail}
                    data-testid="button-update-email"
                  >
                    {isUpdatingEmail ? "Updating..." : "Update Email"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Change Password - Only for non-Google users */}
          {!isGoogleUser && (
            <Card data-testid="card-change-password">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Change Password
                </CardTitle>
                <CardDescription>Update your password</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdatePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPasswordForPassword}
                      onChange={(e) => setCurrentPasswordForPassword(e.target.value)}
                      placeholder="Enter current password"
                      data-testid="input-current-password"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      data-testid="input-new-password"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      data-testid="input-confirm-password"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    disabled={isUpdatingPassword || !currentPasswordForPassword || !newPassword || !confirmPassword}
                    data-testid="button-update-password"
                  >
                    {isUpdatingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Favorite Sports */}
          <Card data-testid="card-favorite-sports">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Favorite Sports</CardTitle>
                <CardDescription>Your preferred sports in order</CardDescription>
              </div>
              {!isEditingSports && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={startEditingSports}
                  data-testid="button-edit-sports"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isEditingSports ? (
                <div className="space-y-4">
                  {/* Sport Selection */}
                  <div className="space-y-2">
                    <Label>Select Sports</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {SPORTS.map((sport) => (
                        <div key={sport} className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-sport-${sport}`}
                            checked={editSports.includes(sport)}
                            onCheckedChange={() => toggleSport(sport)}
                            data-testid={`checkbox-sport-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                          />
                          <Label
                            htmlFor={`edit-sport-${sport}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {sport}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sport Ordering */}
                  {editSports.length > 0 && (
                    <div className="space-y-2">
                      <Label>Order Your Sports</Label>
                      <div className="space-y-2">
                        {editSports.map((sport, index) => (
                          <div
                            key={sport}
                            className="flex items-center justify-between p-3 border rounded-md"
                            data-testid={`sport-item-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <span className="font-medium">
                              {index + 1}. {sport}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => moveSportUp(index)}
                                disabled={index === 0}
                                data-testid={`button-move-up-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => moveSportDown(index)}
                                disabled={index === editSports.length - 1}
                                data-testid={`button-move-down-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleSaveSports} data-testid="button-save-sports">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingSports(false)}
                      data-testid="button-cancel-sports"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                profile?.favoriteSports && profile.favoriteSports.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.favoriteSports.map((sport, index) => (
                      <Badge 
                        key={sport} 
                        variant="secondary"
                        data-testid={`badge-sport-${sport.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {index + 1}. {sport}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No favorite sports selected</p>
                )
              )}
            </CardContent>
          </Card>

          {/* Favorite Teams */}
          <Card data-testid="card-favorite-teams">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle>Favorite Teams</CardTitle>
                <CardDescription>Your selected teams</CardDescription>
              </div>
              {!isEditingTeams && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={startEditingTeams}
                  data-testid="button-edit-teams"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isEditingTeams ? (
                <div className="space-y-6">
                  {editSports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Please add favorite sports first to select teams.
                    </p>
                  ) : (
                    editSports.map((sport) => {
                      const divisions = TEAMS_BY_SPORT[sport as keyof typeof TEAMS_BY_SPORT];
                      const sportTeams = editTeams[sport] || [];
                      
                      // Skip individual sports that don't have teams
                      if (!divisions) return null;
                      
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
                                  {Object.entries(divisions).map(([division, teams]: [string, string[]]) => (
                                    <CommandGroup key={division} heading={division}>
                                      {teams.map((team: string) => (
                                        <CommandItem
                                          key={team}
                                          value={team}
                                          onSelect={() => toggleTeam(sport, team)}
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
                                  data-testid={`badge-edit-team-${sport.toLowerCase().replace(/\s+/g, '-')}-${team.toLowerCase().replace(/\s+/g, '-')}`}
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
                    })
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleSaveTeams} data-testid="button-save-teams">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingTeams(false)}
                      data-testid="button-cancel-teams"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                profile?.favoriteTeams && profile.favoriteTeams.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.favoriteTeams.map((team) => (
                      <Badge 
                        key={team} 
                        variant="outline"
                        data-testid={`badge-team-${team.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {team}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No favorite teams selected</p>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
