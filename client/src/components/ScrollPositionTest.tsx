import React, { useEffect, useState } from 'react';
import { useSport } from '@/contexts/SportContext';
import { useScrollPosition } from '@/hooks/useScrollPosition';

/**
 * Test component to validate scroll position management during sport transitions
 * This component can be temporarily added to the app for testing purposes
 */
export const ScrollPositionTest: React.FC = () => {
  const { selectedSport, isTransitioning, savedScrollPosition } = useSport();
  const { scrollPosition, hasScrolled } = useScrollPosition();
  const [testResults, setTestResults] = useState<string[]>([]);

  useEffect(() => {
    const logScrollState = () => {
      const timestamp = new Date().toLocaleTimeString();
      const result = `[${timestamp}] Sport: ${selectedSport || 'None'}, Transitioning: ${isTransitioning}, Current Scroll: ${scrollPosition}, Saved: ${savedScrollPosition}, Has Scrolled: ${hasScrolled}`;
      
      setTestResults(prev => [...prev.slice(-4), result]); // Keep last 5 results
    };

    logScrollState();
  }, [selectedSport, isTransitioning, scrollPosition, savedScrollPosition, hasScrolled]);

  if (!import.meta.env.DEV) {
    return null; // Only show in development
  }

  return (
    <div 
      style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        maxWidth: '400px',
        zIndex: 9999,
        fontFamily: 'monospace'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
        Scroll Position Test
      </div>
      {testResults.map((result, index) => (
        <div key={index} style={{ marginBottom: '2px' }}>
          {result}
        </div>
      ))}
      <div style={{ marginTop: '5px', fontSize: '10px', opacity: 0.7 }}>
        This component is only visible in development mode
      </div>
    </div>
  );
};

export default ScrollPositionTest;