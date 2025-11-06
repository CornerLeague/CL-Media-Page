import { useEffect, useRef, useCallback } from 'react';

interface ScrollPositionOptions {
  /**
   * Whether to save scroll position automatically on unmount
   */
  saveOnUnmount?: boolean;
  /**
   * Whether to restore scroll position automatically on mount
   */
  restoreOnMount?: boolean;
  /**
   * Delay before restoring scroll position (in ms)
   */
  restoreDelay?: number;
  /**
   * Scroll behavior for restoration
   */
  scrollBehavior?: ScrollBehavior;
  /**
   * Storage key for persisting scroll position
   */
  storageKey?: string;
}

interface ScrollPositionReturn {
  /**
   * Current scroll position
   */
  scrollPosition: number;
  /**
   * Save current scroll position
   */
  saveScrollPosition: () => number;
  /**
   * Restore scroll position
   */
  restoreScrollPosition: (position?: number) => void;
  /**
   * Scroll to top smoothly
   */
  scrollToTop: () => void;
  /**
   * Check if user has scrolled significantly
   */
  hasScrolled: boolean;
}

/**
 * Custom hook for managing scroll position during component transitions
 */
export const useScrollPosition = (options: ScrollPositionOptions = {}): ScrollPositionReturn => {
  const {
    saveOnUnmount = false,
    restoreOnMount = false,
    restoreDelay = 100,
    scrollBehavior = 'smooth',
    storageKey = 'scroll-position'
  } = options;

  const savedPosition = useRef<number>(0);
  const currentPosition = useRef<number>(0);

  // Get current scroll position
  const getCurrentScrollPosition = useCallback((): number => {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }, []);

  // Save current scroll position
  const saveScrollPosition = useCallback((): number => {
    const position = getCurrentScrollPosition();
    savedPosition.current = position;
    currentPosition.current = position;
    
    if (storageKey) {
      try {
        sessionStorage.setItem(storageKey, position.toString());
      } catch (error) {
        console.warn('Failed to save scroll position to sessionStorage:', error);
      }
    }
    
    return position;
  }, [getCurrentScrollPosition, storageKey]);

  // Restore scroll position
  const restoreScrollPosition = useCallback((position?: number) => {
    const targetPosition = position ?? savedPosition.current;
    
    if (targetPosition > 0) {
      setTimeout(() => {
        window.scrollTo({
          top: targetPosition,
          behavior: scrollBehavior
        });
      }, restoreDelay);
    }
  }, [scrollBehavior, restoreDelay]);

  // Scroll to top
  const scrollToTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: scrollBehavior
    });
  }, [scrollBehavior]);

  // Update current position on scroll
  useEffect(() => {
    const handleScroll = () => {
      currentPosition.current = getCurrentScrollPosition();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [getCurrentScrollPosition]);

  // Save on unmount if enabled
  useEffect(() => {
    return () => {
      if (saveOnUnmount) {
        saveScrollPosition();
      }
    };
  }, [saveOnUnmount, saveScrollPosition]);

  // Restore on mount if enabled
  useEffect(() => {
    if (restoreOnMount && storageKey) {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const position = parseInt(saved, 10);
          if (!isNaN(position)) {
            restoreScrollPosition(position);
          }
        }
      } catch (error) {
        console.warn('Failed to restore scroll position from sessionStorage:', error);
      }
    }
  }, [restoreOnMount, restoreScrollPosition, storageKey]);

  return {
    scrollPosition: currentPosition.current,
    saveScrollPosition,
    restoreScrollPosition,
    scrollToTop,
    hasScrolled: currentPosition.current > 50, // Consider scrolled if more than 50px
  };
};

export default useScrollPosition;