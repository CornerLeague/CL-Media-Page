import React, { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Activity } from 'lucide-react';
import type { RealTimeUpdateEvent } from '../hooks/useRealTimeScoreUpdates';

interface VirtualizedUpdatesListProps {
  updates: RealTimeUpdateEvent[];
  ItemComponent: React.ComponentType<{ update: RealTimeUpdateEvent }>;
  height: number;
  itemHeight?: number;
  className?: string;
}

export const VirtualizedUpdatesList = memo<VirtualizedUpdatesListProps>(({
  updates,
  ItemComponent,
  height,
  itemHeight = 80,
  className = ''
}) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleRange = useMemo(() => {
    const containerHeight = height;
    const totalItems = updates.length;
    
    if (totalItems === 0) return { start: 0, end: 0 };

    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      totalItems
    );

    return {
      start: Math.max(0, startIndex - 2), // Add buffer
      end: Math.min(totalItems, endIndex + 2) // Add buffer
    };
  }, [scrollTop, height, itemHeight, updates.length]);

  const visibleItems = useMemo(() => {
    return updates.slice(visibleRange.start, visibleRange.end);
  }, [updates, visibleRange]);

  const totalHeight = updates.length * itemHeight;
  const offsetY = visibleRange.start * itemHeight;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  if (updates.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ height }}>
        <div className="text-center py-8 text-gray-500">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No updates yet</p>
          <p className="text-sm">Updates will appear here when games are active</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          {visibleItems.map((update, index) => (
            <div
              key={`${update.gameId}-${update.timestamp}-${visibleRange.start + index}`}
              style={{ height: itemHeight }}
              className="px-1 py-1"
            >
              <ItemComponent update={update} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

VirtualizedUpdatesList.displayName = 'VirtualizedUpdatesList';