import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useQuery } from '@tanstack/react-query';
import type { UserProfile } from '@shared/schema';
import type { Sport } from '@/data/sportsTeams';

interface SportContextType {
  selectedSport: Sport | null;
  setSelectedSport: (sport: Sport) => void;
  availableSports: Sport[];
}

const SportContext = createContext<SportContextType | undefined>(undefined);

export function SportProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);

  // Fetch user profile to get favorite sports
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile", user?.uid],
    enabled: !!user?.uid,
  });

  const availableSports = (profile?.favoriteSports || []) as Sport[];

  // Set default sport to first favorite sport when profile loads
  useEffect(() => {
    if (availableSports.length > 0 && !selectedSport) {
      setSelectedSport(availableSports[0]);
    }
  }, [availableSports, selectedSport]);

  return (
    <SportContext.Provider value={{ selectedSport, setSelectedSport, availableSports }}>
      {children}
    </SportContext.Provider>
  );
}

export function useSport() {
  const context = useContext(SportContext);
  if (context === undefined) {
    throw new Error('useSport must be used within a SportProvider');
  }
  return context;
}
