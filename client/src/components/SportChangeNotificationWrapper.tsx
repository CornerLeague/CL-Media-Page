import React from 'react';
import { SportChangeNotification } from '@/components/ui/sport-change-notification';
import { useSportChangeNotification } from '@/hooks/useSportChangeNotification';

export const SportChangeNotificationWrapper: React.FC = () => {
  const { notification, hideNotification } = useSportChangeNotification();

  return (
    <SportChangeNotification
      isVisible={notification.isVisible}
      type={notification.type}
      message={notification.message}
      sportName={notification.sportName}
      onClose={hideNotification}
    />
  );
};