import React from 'react';
import { CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SportChangeNotificationProps {
  isVisible: boolean;
  type: 'loading' | 'success' | 'error';
  message: string;
  sportName?: string;
  onClose?: () => void;
}

export const SportChangeNotification: React.FC<SportChangeNotificationProps> = ({
  isVisible,
  type,
  message,
  sportName,
  onClose
}) => {
  if (!isVisible) return null;

  const getIcon = () => {
    switch (type) {
      case 'loading':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4" />;
      case 'error':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getStyles = () => {
    switch (type) {
      case 'loading':
        return 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200';
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200';
      default:
        return '';
    }
  };

  return (
    <div
      className={cn(
        'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg transition-all duration-300 ease-in-out',
        getStyles(),
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
    >
      {getIcon()}
      <div className="flex flex-col">
        <span className="text-sm font-medium">{message}</span>
        {sportName && (
          <span className="text-xs opacity-75">
            {type === 'loading' ? `Switching to ${sportName}...` : `Now viewing ${sportName}`}
          </span>
        )}
      </div>
      {onClose && type !== 'loading' && (
        <button
          onClick={onClose}
          className="ml-2 text-current opacity-50 hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
};