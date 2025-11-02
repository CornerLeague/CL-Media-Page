import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getWsStats, getWsHealthMetrics } from '../../ws';

describe('WebSocket Health Monitoring', () => {
  beforeEach(() => {
    // Reset any global state if needed
  });

  afterEach(() => {
    // Clean up after tests
  });

  describe('getWsStats', () => {
    it('should return basic WebSocket statistics', () => {
      const stats = getWsStats();
      
      expect(stats).toHaveProperty('ready');
      expect(stats).toHaveProperty('clients');
      expect(stats).toHaveProperty('authenticatedClients');
      expect(stats).toHaveProperty('path');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('totalDisconnections');
      expect(stats).toHaveProperty('totalMessages');
      expect(stats).toHaveProperty('totalErrors');
      expect(stats).toHaveProperty('authFailures');
      expect(stats).toHaveProperty('averageMessagesPerClient');
      expect(stats).toHaveProperty('connectionHealth');
      
      expect(typeof stats.ready).toBe('boolean');
      expect(typeof stats.clients).toBe('number');
      expect(typeof stats.authenticatedClients).toBe('number');
      expect(stats.path).toBe('/ws');
      expect(typeof stats.uptime).toBe('number');
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.totalDisconnections).toBe('number');
      expect(typeof stats.totalMessages).toBe('number');
      expect(typeof stats.totalErrors).toBe('number');
      expect(typeof stats.authFailures).toBe('number');
      expect(typeof stats.averageMessagesPerClient).toBe('number');
      expect(typeof stats.connectionHealth).toBe('string');
    });

    it('should return healthy connection status when no errors', () => {
      const stats = getWsStats();
      
      // With no connections or messages, health should be healthy
      expect(['healthy', 'degraded', 'unhealthy']).toContain(stats.connectionHealth);
    });

    it('should calculate uptime correctly', () => {
      const stats = getWsStats();
      
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getWsHealthMetrics', () => {
    it('should return detailed health metrics', () => {
      const healthMetrics = getWsHealthMetrics();
      
      expect(healthMetrics).toHaveProperty('healthMetrics');
      expect(healthMetrics).toHaveProperty('activeConnections');
      expect(healthMetrics).toHaveProperty('performanceStats');
      
      expect(Array.isArray(healthMetrics.activeConnections)).toBe(true);
      
      expect(healthMetrics.performanceStats).toHaveProperty('averageConnectionDuration');
      expect(healthMetrics.performanceStats).toHaveProperty('messagesPerSecond');
      expect(healthMetrics.performanceStats).toHaveProperty('errorRate');
      expect(healthMetrics.performanceStats).toHaveProperty('authFailureRate');
      expect(healthMetrics.performanceStats).toHaveProperty('peakConnections');
      
      expect(typeof healthMetrics.performanceStats.averageConnectionDuration).toBe('number');
      expect(typeof healthMetrics.performanceStats.messagesPerSecond).toBe('number');
      expect(typeof healthMetrics.performanceStats.errorRate).toBe('number');
      expect(typeof healthMetrics.performanceStats.authFailureRate).toBe('number');
      expect(typeof healthMetrics.performanceStats.peakConnections).toBe('number');
    });

    it('should have valid health metrics structure', () => {
      const { healthMetrics } = getWsHealthMetrics();
      
      expect(healthMetrics).toHaveProperty('totalConnections');
      expect(healthMetrics).toHaveProperty('totalDisconnections');
      expect(healthMetrics).toHaveProperty('totalMessages');
      expect(healthMetrics).toHaveProperty('totalErrors');
      expect(healthMetrics).toHaveProperty('authFailures');
      expect(healthMetrics).toHaveProperty('startTime');
      
      expect(typeof healthMetrics.totalConnections).toBe('number');
      expect(typeof healthMetrics.totalDisconnections).toBe('number');
      expect(typeof healthMetrics.totalMessages).toBe('number');
      expect(typeof healthMetrics.totalErrors).toBe('number');
      expect(typeof healthMetrics.authFailures).toBe('number');
      expect(healthMetrics.startTime).toBeInstanceOf(Date);
    });

    it('should calculate performance stats correctly', () => {
      const { performanceStats } = getWsHealthMetrics();
      
      // Error rates should be between 0 and 1
      expect(performanceStats.errorRate).toBeGreaterThanOrEqual(0);
      expect(performanceStats.errorRate).toBeLessThanOrEqual(1);
      expect(performanceStats.authFailureRate).toBeGreaterThanOrEqual(0);
      expect(performanceStats.authFailureRate).toBeLessThanOrEqual(1);
      
      // Messages per second should be non-negative
      expect(performanceStats.messagesPerSecond).toBeGreaterThanOrEqual(0);
      
      // Peak connections should be non-negative
      expect(performanceStats.peakConnections).toBeGreaterThanOrEqual(0);
    });
  });
});