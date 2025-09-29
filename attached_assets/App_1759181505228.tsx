import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/toaster";
import { TopNavBar } from "@/components/TopNavBar";
import { AISummarySection } from "@/components/AISummarySection";
import { SportsFeedSection } from "@/components/SportsFeedSection";
import { BestSeatsSection } from "@/components/BestSeatsSection";
import { FanExperiencesSection } from "@/components/FanExperiencesSection";
import { ProtectedRoute, FullyProtectedRoute, OnboardingRoute } from "@/components/auth/ProtectedRoute";
import { FirebaseAuthProvider, useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { FirebaseSignIn } from "@/components/auth/FirebaseSignIn";
import { OnboardingRouter } from "@/pages/onboarding";
import { PreferencesPage } from "@/pages/profile/PreferencesPage";
import { useAuthOnboarding } from "@/hooks/useAuthOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { usePersonalizedFeed } from "@/hooks/usePersonalizedFeed";
import { TeamSection } from "@/components/TeamSection";
import { ContentFeed } from "@/components/ContentFeed";
import { AuthLoadingScreen, AuthErrorScreen } from "@/components/auth/AuthLoadingStates";
import { apiClient, createApiQueryClient, type OnboardingStatusResponse } from "@/lib/api-client";
import { DebugProvider } from "@/components/debug/DebugProvider";
import { useEffect, useState } from "react";

// Create React Query client with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (except 429)
        if (error && typeof error === 'object' && 'statusCode' in error) {
          const statusCode = (error as any).statusCode;
          if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
            return false;
          }
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// Enhanced dashboard component with personalized content integration
function DashboardPage() {
  const { flowState, isLoading: authLoading, onboardingError } = useAuthOnboarding();

  // Use the new useAuth hook to get user preferences
  const {
    user,
    isLoading: userLoading,
    isAuthenticated,
    isOnboarded,
    userPreferences,
    getIdToken,
    shouldShowTeams,
  } = useAuth();

  // Set up API client with Firebase authentication
  useEffect(() => {
    if (isAuthenticated && getIdToken) {
      apiClient.setFirebaseAuth({
        getIdToken,
        isAuthenticated: true,
        userId: user?.uid,
      });
    }
  }, [isAuthenticated, getIdToken, user?.uid]);

  // Get personalized feed data based on user preferences
  const personalizedData = usePersonalizedFeed(
    userPreferences,
    isAuthenticated ? { getIdToken, isAuthenticated: true, userId: user?.uid } : undefined,
    {
      enabled: isAuthenticated && isOnboarded && flowState === 'authenticated',
      refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    }
  );

  // Get featured team dashboard for AI Summary section
  const featuredTeam = personalizedData.featuredTeam;

  const isLoading = authLoading || userLoading || personalizedData.isLoading;
  const error = onboardingError || personalizedData.error;

  // Show auth loading screen for authentication states
  if (authLoading || flowState === 'initializing' || flowState === 'checking') {
    return <AuthLoadingScreen stage={flowState} />;
  }

  // Show error screen for API errors with retry functionality
  if (error && flowState === 'authenticated') {
    return (
      <AuthErrorScreen
        error={error instanceof Error ? error.message : String(error)}
        type="api"
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Handle team selection for detailed view
  const handleTeamClick = (teamId: string) => {
    // Navigate to team detail or update featured team
    console.log('Selected team:', teamId);
  };

  const handleNewsClick = (article: any) => {
    if (article.url) {
      window.open(article.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSportsItemClick = (item: any) => {
    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Dashboard content - only renders when fully authenticated and onboarded
  return (
    <div className="min-h-screen bg-background">
      <TopNavBar />

      <main className="relative">
        {/* AI Summary Section - Hero area with featured team */}
        <AISummarySection
          teamDashboard={featuredTeam}
          isLoading={isLoading}
          error={error as Error | null}
        />

        {/* Team Section - Show selected teams */}
        {shouldShowTeams && (
          <TeamSection
            teams={userPreferences.teams}
            teamDashboards={personalizedData.teamDashboards}
            isLoading={isLoading}
            error={error as Error | null}
            onTeamClick={handleTeamClick}
          />
        )}

        {/* Personalized Content Feed */}
        <ContentFeed
          personalizedData={personalizedData}
          userPreferences={userPreferences}
          onNewsClick={handleNewsClick}
          onSportsItemClick={handleSportsItemClick}
        />

        {/* Sports Feed Section - Keep for backward compatibility if needed */}
        <SportsFeedSection
          teamDashboard={featuredTeam}
          isLoading={isLoading}
          error={error as Error | null}
        />

        {/* Best Seats Section - Use featured team */}
        <BestSeatsSection
          teamDashboard={featuredTeam}
          isLoading={isLoading}
          error={error as Error | null}
        />

        {/* Fan Experiences Section - Use featured team */}
        <FanExperiencesSection
          teamDashboard={featuredTeam}
          isLoading={isLoading}
          error={error as Error | null}
        />
      </main>
    </div>
  );
}

// Authentication loading component
function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="text-muted-foreground font-body">Loading Corner League Media...</p>
      </div>
    </div>
  );
}

// Enhanced sign in page with integrated auth flow
function SignInPage() {
  const { flowState, isAuthenticated, isOnboarded } = useAuthOnboarding();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle sign-in success with proper navigation logic
  const handleSignInSuccess = async () => {
    // Check if user was redirected from onboarding
    const state = location.state as any;
    if (state?.returnToOnboarding && state?.from?.pathname?.includes('/onboarding')) {
      // Return to the onboarding step they were trying to access
      navigate(state.from.pathname, { replace: true });
      return;
    }

    // The hook will automatically handle navigation based on onboarding status
    // No manual navigation needed here - let useAuthOnboarding auto-redirect handle it
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && flowState === 'authenticated') {
      // Check if user came from onboarding and should return there
      const state = location.state as any;
      if (state?.returnToOnboarding && state?.from?.pathname?.includes('/onboarding')) {
        navigate(state.from.pathname, { replace: true });
        return;
      }
      // Otherwise redirect to dashboard
      navigate('/', { replace: true });
    } else if (isAuthenticated && flowState === 'onboarding') {
      // User is authenticated but needs onboarding
      const state = location.state as any;
      if (state?.returnToOnboarding && state?.from?.pathname?.includes('/onboarding')) {
        navigate(state.from.pathname, { replace: true });
      }
    }
  }, [isAuthenticated, flowState, navigate, location.state]);

  // Show loading screen during auth flow transitions
  if (flowState === 'checking' || (flowState === 'onboarding' && isAuthenticated)) {
    return <AuthLoadingScreen stage={flowState} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 max-w-md mx-auto px-4">
        <div className="space-y-2">
          <h1 className="font-display font-bold text-3xl text-foreground">
            Corner League Media
          </h1>
          <p className="text-muted-foreground font-body">
            Your personalized sports experience awaits
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {location.state?.returnToOnboarding
              ? "Please sign in to continue setting up your sports preferences."
              : "Sign in to access your personalized team dashboard, news feed, and exclusive content."
            }
          </p>

          <FirebaseSignIn onSuccess={handleSignInSuccess} />
        </div>

        {/* Error state for sign-in page */}
        {flowState === 'error' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">
              Having trouble signing in? Please try again or contact support.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Enhanced app router with integrated auth flow
function AppRouter() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        {/* Main dashboard route - requires full authentication and onboarding */}
        <Route
          path="/"
          element={
            <FullyProtectedRoute>
              <DashboardPage />
            </FullyProtectedRoute>
          }
        />

        {/* Onboarding routes - requires authentication but not completed onboarding */}
        <Route
          path="/onboarding/*"
          element={
            <OnboardingRoute>
              <OnboardingRouter />
            </OnboardingRoute>
          }
        />

        {/* Profile preferences route - requires full authentication and onboarding */}
        <Route
          path="/profile/preferences"
          element={
            <FullyProtectedRoute>
              <PreferencesPage />
            </FullyProtectedRoute>
          }
        />

        {/* Authentication route - public route */}
        <Route path="/auth/sign-in" element={<SignInPage />} />

        {/* Catch all route - redirect based on auth state */}
        <Route path="*" element={<AuthAwareRedirect />} />
      </Routes>
    </Router>
  );
}

// Smart redirect component that uses auth state
function AuthAwareRedirect() {
  const { isAuthenticated, isOnboarded, flowState, onboardingStatus } = useAuthOnboarding();
  const location = useLocation();

  // Show loading while determining auth state
  if (flowState === 'initializing' || flowState === 'checking') {
    return <AuthLoadingScreen stage={flowState} />;
  }

  // Prevent redirect loops by checking current path
  const currentPath = location.pathname;

  // Don't redirect if already on appropriate pages
  if (currentPath === '/auth/sign-in' || currentPath.startsWith('/onboarding/') || currentPath === '/') {
    // User is already on the right path, let the specific route handlers manage them
    return <Navigate to="/onboarding/step/1" replace />;
  }

  // Redirect based on auth state
  if (!isAuthenticated) {
    // For unauthenticated users, redirect to onboarding to start their journey
    return <Navigate to="/onboarding/step/1" replace />;
  }

  if (isAuthenticated && !isOnboarded) {
    // Redirect to the appropriate onboarding step
    const step = onboardingStatus?.currentStep || 1;
    return <Navigate to={`/onboarding/step/${step}`} replace />;
  }

  if (isAuthenticated && isOnboarded) {
    return <Navigate to="/" replace />;
  }

  // Fallback - start onboarding for unknown states
  return <Navigate to="/onboarding/step/1" replace />;
}

// Main App component
function App() {
  return (
    <DebugProvider
      enableKeyboardShortcuts={true}
      enableGlobalErrorBoundary={true}
    >
      <FirebaseAuthProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AppRouter />
            <Toaster />
          </ThemeProvider>
        </QueryClientProvider>
      </FirebaseAuthProvider>
    </DebugProvider>
  );
}

export default App;