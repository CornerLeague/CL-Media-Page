import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Lock, User as UserIcon } from "lucide-react";
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import type { UserProfile } from "@shared/schema";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState("");
  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Fetch user profile
  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile", user?.uid],
    enabled: !!user?.uid,
  });

  // Check if user signed up with Google (provider ID will be "google.com")
  const isGoogleUser = user?.providerData?.some(provider => provider.providerId === "google.com");

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
      // Re-authenticate user before updating email
      const credential = EmailAuthProvider.credential(user.email!, currentPasswordForEmail);
      await reauthenticateWithCredential(user, credential);
      
      // Update email
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
      // Re-authenticate user before updating password
      const credential = EmailAuthProvider.credential(user.email!, currentPasswordForPassword);
      await reauthenticateWithCredential(user, credential);
      
      // Update password
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Profile Information
              </CardTitle>
              <CardDescription>Your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            <CardHeader>
              <CardTitle>Favorite Sports</CardTitle>
              <CardDescription>Your preferred sports in order</CardDescription>
            </CardHeader>
            <CardContent>
              {profile?.favoriteSports && profile.favoriteSports.length > 0 ? (
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
              )}
            </CardContent>
          </Card>

          {/* Favorite Teams */}
          <Card data-testid="card-favorite-teams">
            <CardHeader>
              <CardTitle>Favorite Teams</CardTitle>
              <CardDescription>Your selected teams</CardDescription>
            </CardHeader>
            <CardContent>
              {profile?.favoriteTeams && profile.favoriteTeams.length > 0 ? (
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
