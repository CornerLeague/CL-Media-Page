import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { isDevHeaderAllowed, getDevUid } from '@/lib/devAuth';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, loading, refresh } = useAuth();
  const { toast } = useToast();
  // Derive initial auth tab from URL (?tab=signup|signin)
  const initialTab = (() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('tab');
      return t === 'signup' ? 'signup' : 'signin';
    } catch {
      return 'signin';
    }
  })();
  const [tabValue, setTabValue] = useState(initialTab);
  const [isSigningIn, setIsSigningIn] = useState(false);
  // Track when we're in the signup flow to avoid auto-redirecting to home
  const [isSignUpFlow, setIsSignUpFlow] = useState(initialTab === 'signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Sync selected tab with current URL query param to avoid timing flakiness
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const t = sp.get('tab');
      const next = t === 'signup' ? 'signup' : 'signin';
      if (next !== tabValue) {
        setTabValue(next);
        setIsSignUpFlow(next === 'signup');
      }
    } catch {/* no-op */}
  }, []);
  useEffect(() => {
    // Redirect to home if already logged in
    if (user && !loading && !isSignUpFlow) {
      setLocation('/');
    }
  }, [user, loading, isSignUpFlow, setLocation]);

  const handleGoogleSignIn = async () => {
    // Explicitly communicate current state: Google auth isn’t configured
    toast({
      title: 'Google sign-in unavailable',
      description: 'Google OAuth is not configured in this environment.',
      variant: 'destructive',
    });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSigningIn(true);
    try {
      const auth = getFirebaseAuth();
      if (!auth) {
        // Dev override path: allow sign-in without Firebase
        if (isDevHeaderAllowed()) {
          const devUid = getDevUid() || username || 'dev-user';
          try {
            if (typeof window !== 'undefined') {
              window.localStorage?.setItem?.('devUid', String(devUid));
            }
          } catch {}
        } else {
          throw new Error('Firebase is not configured. Please set client env vars.');
        }
      }
      if (auth) {
        await signInWithEmailAndPassword(auth, username, password);
      }
      await refresh();
      toast({
        title: 'Welcome back!',
        description: 'Successfully signed in.',
      });
      setLocation('/');
    } catch (error: any) {
      console.error('Error signing in:', error);
      toast({
        title: 'Sign in failed',
        description: error?.message || 'Could not sign in with email and password.',
        variant: 'destructive',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSignUpFlow(true);
    
    // Validate password match
    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same.',
        variant: 'destructive',
      });
      return;
    }

    // Validate first/last name
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter your first and last name.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSigningIn(true);
    try {
      const auth = getFirebaseAuth();
      let firebaseUid: string | null = null;
      if (!auth) {
        // Dev override path: simulate account creation and use devUid
        if (isDevHeaderAllowed()) {
          const devUid = getDevUid() || username || 'dev-user';
          firebaseUid = String(devUid);
          try {
            if (typeof window !== 'undefined') {
              window.localStorage?.setItem?.('devUid', String(firebaseUid));
            }
          } catch {}
        } else {
          throw new Error('Firebase is not configured. Please set client env vars.');
        }
      } else {
        const cred = await createUserWithEmailAndPassword(auth, username, password);
        // Best-effort: set displayName to user's full name
        try {
          await updateProfile(cred.user, { displayName: `${firstName.trim()} ${lastName.trim()}` });
        } catch {}
        firebaseUid = cred.user.uid;
      }
      // Create initial profile in backend (favorites empty by default)
      await apiRequest('POST', '/api/profile', {
        firebaseUid: String(firebaseUid),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        favoriteSports: [],
        favoriteTeams: [],
      });

      await refresh();
      toast({
        title: 'Account created!',
        description: 'Welcome to Corner League Media. You are now signed in.',
      });
      setLocation('/onboarding');
    } catch (error: any) {
      console.error('Error signing up:', error);
      toast({
        title: 'Sign up failed',
        description: error?.message || 'Could not create account.',
        variant: 'destructive',
      });
    } finally {
      setIsSigningIn(false);
      // Keep isSignUpFlow true through navigation to prevent home redirect
    }
  };

  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Corner League Media</CardTitle>
          <CardDescription>
            Sign in or create an account to access your personalized sports feed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={tabValue} onValueChange={(v) => { setTabValue(v); setIsSignUpFlow(v === 'signup'); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2" data-testid="tabs-auth">
              <TabsTrigger value="signin" data-testid="tab-signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin" className="space-y-4">
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-username">Email</Label>
                  <Input
                    id="signin-username"
                    type="text"
                    placeholder="you@example.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isSigningIn}
                    data-testid="input-signin-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSigningIn}
                    data-testid="input-signin-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSigningIn}
                  data-testid="button-email-signin"
                >
                  {isSigningIn ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                onClick={handleGoogleSignIn}
                disabled
                aria-disabled
                variant="outline"
                className="w-full"
                title="Google sign-in is not configured"
                data-testid="button-google-signin"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google (coming soon)
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4">
              <form onSubmit={handleEmailSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-first-name">First Name</Label>
                  <Input
                    id="signup-first-name"
                    type="text"
                    placeholder="Jane"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={isSigningIn}
                    data-testid="input-signup-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-last-name">Last Name</Label>
                  <Input
                    id="signup-last-name"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={isSigningIn}
                    data-testid="input-signup-last-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-username">Email</Label>
                  <Input
                    id="signup-username"
                    type="text"
                    placeholder="you@example.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    disabled={isSigningIn}
                    data-testid="input-signup-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSigningIn}
                    data-testid="input-signup-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                  <Input
                    id="signup-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isSigningIn}
                    data-testid="input-signup-confirm-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSigningIn}
                  data-testid="button-email-signup"
                >
                  {isSigningIn ? 'Creating account...' : 'Sign Up'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
