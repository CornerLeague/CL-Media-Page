import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SPORTS, TEAMS_BY_SPORT, Sport, sportHasTeams } from "@/data/sportsTeams";
import { cn } from "@/lib/utils";
import { Pencil, ChevronUp, ChevronDown, ChevronsUpDown, Check, X } from "lucide-react";
import type { UserProfile } from "@shared/schema";

export default function Settings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading, error } = useQuery<UserProfile | null>({
    queryKey: ["/api/profile", String(user?.id ?? "")],
    enabled: !!user,
    queryFn: async ({ queryKey }) => {
      const url = queryKey.join("/") as string;
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return await res.json();
    },
  });

  // Local edit state
  const [editingName, setEditingName] = useState(false);
  const [editingSports, setEditingSports] = useState(false);
  const [editingTeams, setEditingTeams] = useState(false);

  // Name fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  useEffect(() => {
    setFirstName(profile?.firstName ?? "");
    setLastName(profile?.lastName ?? "");
  }, [profile?.firstName, profile?.lastName]);

  // Sports selection and ordering
  const [selectedSports, setSelectedSports] = useState<Sport[]>([]);
  const [orderedSports, setOrderedSports] = useState<Sport[]>([]);
  useEffect(() => {
    const fav = (profile?.favoriteSports ?? []) as Sport[];
    setSelectedSports(fav);
    setOrderedSports(fav);
  }, [profile?.favoriteSports]);

  const toggleSport = (sport: Sport) => {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
    setOrderedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

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

  // Teams selection
  const [favoriteTeamsEdit, setFavoriteTeamsEdit] = useState<string[]>([]);
  const [openTeamsDropdown, setOpenTeamsDropdown] = useState(false);
  useEffect(() => {
    setFavoriteTeamsEdit(profile?.favoriteTeams ?? []);
  }, [profile?.favoriteTeams]);

  // Only include team-based sports when looking up divisions/teams
  const teamSports = selectedSports.filter(sportHasTeams) as (keyof typeof TEAMS_BY_SPORT)[];
  const allTeamsAcrossSelectedSports: { sport: Sport; team: string; division: string }[] = teamSports.flatMap((sport) => {
    const divisions = TEAMS_BY_SPORT[sport];
    return Object.entries(divisions).flatMap(([division, teams]) => teams.map((team) => ({ sport, team, division })));
  });

  const toggleTeam = (team: string) => {
    setFavoriteTeamsEdit((prev) => (prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]));
  };

  // Save handlers
  const [savingName, setSavingName] = useState(false);
  const [savingSports, setSavingSports] = useState(false);
  const [savingTeams, setSavingTeams] = useState(false);

  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      const res = await apiRequest("PATCH", `/api/profile/${String(user.id)}/name`, { firstName, lastName });
      const updated = await res.json();
      queryClient.setQueryData(["/api/profile", String(user.id)], updated);
      toast({ title: "Saved", description: "Name updated." });
      setEditingName(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update name.", variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveSports = async () => {
    if (!user) return;
    setSavingSports(true);
    try {
      const res = await apiRequest("PATCH", `/api/profile/${String(user.id)}/sports`, { favoriteSports: orderedSports });
      const updated = await res.json();
      queryClient.setQueryData(["/api/profile", String(user.id)], updated);
      toast({ title: "Saved", description: "Favorite sports updated." });
      setEditingSports(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update sports.", variant: "destructive" });
    } finally {
      setSavingSports(false);
    }
  };

  const handleSaveTeams = async () => {
    if (!user) return;
    setSavingTeams(true);
    try {
      const res = await apiRequest("PATCH", `/api/profile/${String(user.id)}/teams`, { favoriteTeams: favoriteTeamsEdit });
      const updated = await res.json();
      queryClient.setQueryData(["/api/profile", String(user.id)], updated);
      toast({ title: "Saved", description: "Favorite teams updated." });
      setEditingTeams(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update teams.", variant: "destructive" });
    } finally {
      setSavingTeams(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>Manage your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {profileLoading ? (
            <p className="text-sm text-muted-foreground">Loading settings...</p>
          ) : error ? (
            <div className="text-sm text-red-600">Failed to load settings.</div>
          ) : (
            <>
              {/* Profile Information */}
              <div className="bg-card text-card-foreground border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-base">Profile Information</p>
                    <p className="text-sm text-muted-foreground">Your account details</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingName((v) => !v)} aria-label="Edit name">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {!editingName ? (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="text-sm">{profile?.firstName || profile?.lastName ? `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() : 'Not set'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="text-sm">{user?.username ?? 'Unknown'}</p>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">First Name</Label>
                      <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last Name</Label>
                      <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveName} disabled={savingName}>Save</Button>
                      <Button variant="outline" onClick={() => setEditingName(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Favorite Sports */}
              <div className="bg-card text-card-foreground border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-base">Favorite Sports</p>
                    <p className="text-sm text-muted-foreground">Your preferred sports in order</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingSports((v) => !v)} aria-label="Edit sports">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {!editingSports ? (
                  profile?.favoriteSports?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.favoriteSports.map((sport, i) => (
                        <Badge key={sport} variant="secondary">{`${i + 1}. ${sport}`}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No sports selected</p>
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <p className="text-sm">Select sports</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {SPORTS.map((sport) => (
                          <div key={sport} className="flex items-center space-x-2">
                            <Checkbox id={`sport-${sport}`} checked={selectedSports.includes(sport)} onCheckedChange={() => toggleSport(sport)} />
                            <Label htmlFor={`sport-${sport}`}>{sport}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm">Order sports</p>
                      <div className="space-y-2">
                        {orderedSports.map((sport, index) => (
                          <div key={sport} className="flex items-center justify-between p-2 bg-muted rounded-md">
                            <span className="font-medium">{sport}</span>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => moveUp(index)} disabled={index === 0}>
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => moveDown(index)} disabled={index === orderedSports.length - 1}>
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveSports} disabled={savingSports}>Save</Button>
                      <Button variant="outline" onClick={() => setEditingSports(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Favorite Teams */}
              <div className="bg-card text-card-foreground border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-base">Favorite Teams</p>
                    <p className="text-sm text-muted-foreground">Your selected teams</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingTeams((v) => !v)} aria-label="Edit teams">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                {!editingTeams ? (
                  profile?.favoriteTeams?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.favoriteTeams.map((team) => (
                        <Badge key={team} variant="outline">{team}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No teams selected</p>
                  )
                ) : (
                  <div className="space-y-3">
                    <Popover open={openTeamsDropdown} onOpenChange={setOpenTeamsDropdown}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={openTeamsDropdown} className="w-full justify-between">
                          <span className="text-muted-foreground">
                            {favoriteTeamsEdit.length > 0 ? `${favoriteTeamsEdit.length} team${favoriteTeamsEdit.length > 1 ? 's' : ''} selected` : 'Select teams...'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search teams..." />
                          <CommandList>
                            <CommandEmpty>No teams found.</CommandEmpty>
                            {teamSports.length === 0 ? (
                              <CommandGroup heading="Select sports first">
                                <div className="p-2 text-sm text-muted-foreground">Choose favorite sports to see teams.</div>
                              </CommandGroup>
                            ) : (
                              teamSports.map((sport) => {
                                const divisions = TEAMS_BY_SPORT[sport];
                                return (
                                  <CommandGroup key={sport} heading={sport}>
                                    {Object.entries(divisions).map(([division, teams]) => (
                                      <CommandGroup key={`${sport}-${division}`} heading={division}>
                                        {teams.map((team) => (
                                          <CommandItem key={`${sport}-${team}`} value={team} onSelect={() => toggleTeam(team)}>
                                            <Check className={cn("mr-2 h-4 w-4", favoriteTeamsEdit.includes(team) ? "opacity-100" : "opacity-0")} />
                                            {team}
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    ))}
                                  </CommandGroup>
                                );
                              })
                            )}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {/* Selected teams chips with remove */}
                    {favoriteTeamsEdit.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {favoriteTeamsEdit.map((team) => (
                          <div key={team} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                            <span>{team}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => toggleTeam(team)} aria-label={`Remove ${team}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button onClick={handleSaveTeams} disabled={savingTeams}>Save</Button>
                      <Button variant="outline" onClick={() => setEditingTeams(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Removed bottom Back to Home button in favor of top nav arrow */}
              {/* <Button onClick={() => setLocation("/")} variant="outline">Back to Home</Button> */}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}