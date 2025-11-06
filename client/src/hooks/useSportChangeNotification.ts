import { useState, useEffect, useCallback } from 'react';
import { useSport } from '@/contexts/SportContext';

interface NotificationState {
  isVisible: boolean;
  type: 'loading' | 'success' | 'error';
  message: string;
  sportName?: string;
}

export const useSportChangeNotification = () => {
  const { selectedSport, isTransitioning, lastSportChange } = useSport();
  const [notification, setNotification] = useState<NotificationState>({
    isVisible: false,
    type: 'loading',
    message: '',
    sportName: undefined
  });

  // Show loading notification when transitioning
  useEffect(() => {
    if (isTransitioning) {
      setNotification({
        isVisible: true,
        type: 'loading',
        message: 'Switching sports...',
        sportName: selectedSport || undefined
      });
    } else if (notification.type === 'loading' && notification.isVisible) {
      // Transition completed successfully
      setNotification({
        isVisible: true,
        type: 'success',
        message: 'Sport changed successfully!',
        sportName: selectedSport || undefined
      });

      // Auto-hide success notification after 2 seconds
      const timer = setTimeout(() => {
        setNotification(prev => ({ ...prev, isVisible: false }));
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isTransitioning, selectedSport, notification.type, notification.isVisible]);

  // Handle sport change errors (if any)
  useEffect(() => {
    if (lastSportChange && Date.now() - lastSportChange.getTime() > 5000 && isTransitioning) {
      // If transitioning for more than 5 seconds, show error
      setNotification({
        isVisible: true,
        type: 'error',
        message: 'Sport change taking longer than expected',
        sportName: selectedSport || undefined
      });
    }
  }, [lastSportChange, isTransitioning, selectedSport]);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, isVisible: false }));
  }, []);

  const showCustomNotification = useCallback((
    type: 'loading' | 'success' | 'error',
    message: string,
    sportName?: string
  ) => {
    setNotification({
      isVisible: true,
      type,
      message,
      sportName
    });
  }, []);

  return {
    notification,
    hideNotification,
    showCustomNotification
  };
};