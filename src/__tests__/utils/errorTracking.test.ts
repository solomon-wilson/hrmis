import { errorTracker, trackError } from '../../utils/errorTracking';
import { ValidationError, DatabaseError } from '../../utils/errors';

describe('Error Tracking System', () => {
  beforeEach(() => {
    // Clear error events before each test
    (errorTracker as any).errorEvents.clear();
    (errorTracker as any).lastAlerts.clear();
  });

  describe('Error Tracking', () => {
    it('should track basic errors', () => {
      const error = new Error('Test error');
      
      trackError(error, {
        correlationId: 'test-123',
        method: 'GET',
        path: '/api/test'
      });

      const stats = errorTracker.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.uniqueErrors).toBe(1);
    });

    it('should deduplicate identical errors', () => {
      const error1 = new ValidationError('Invalid input');
      const error2 = new ValidationError('Invalid input');
      
      trackError(error1, { path: '/api/test' });
      trackError(error2, { path: '/api/test' });

      const stats = errorTracker.getErrorStats();
      expect(stats.totalErrors).toBe(2); // Same error occurred twice
      expect(stats.uniqueErrors).toBe(1); // But it's the same unique error
    });

    it('should categorize errors by severity', () => {
      const validationError = new ValidationError('Invalid input');
      const databaseError = new DatabaseError('Connection failed');
      
      trackError(validationError);
      trackError(databaseError);

      const stats = errorTracker.getErrorStats();
      expect(stats.bySeverity.medium).toBe(1); // ValidationError
      expect(stats.bySeverity.critical).toBe(1); // DatabaseError
    });

    it('should group errors by type', () => {
      const error1 = new ValidationError('Invalid email');
      const error2 = new ValidationError('Missing field');
      const error3 = new DatabaseError('Connection timeout');
      
      trackError(error1);
      trackError(error2);
      trackError(error3);

      const stats = errorTracker.getErrorStats();
      expect(stats.byType.ValidationError).toBe(2);
      expect(stats.byType.DatabaseError).toBe(1);
    });
  });

  describe('Alert Rules', () => {
    it('should have default alert rules', () => {
      const rules = errorTracker.getAlertRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(rule => rule.name === 'high_error_rate')).toBe(true);
      expect(rules.some(rule => rule.name === 'critical_error')).toBe(true);
    });

    it('should add custom alert rules', () => {
      const customRule = {
        name: 'custom_test_rule',
        condition: () => true,
        severity: 'warning' as const,
        cooldown: 5,
        enabled: true
      };

      errorTracker.addAlertRule(customRule);
      
      const rules = errorTracker.getAlertRules();
      expect(rules.some(rule => rule.name === 'custom_test_rule')).toBe(true);
    });

    it('should remove alert rules', () => {
      const customRule = {
        name: 'removable_rule',
        condition: () => false,
        severity: 'warning' as const,
        cooldown: 5,
        enabled: true
      };

      errorTracker.addAlertRule(customRule);
      errorTracker.removeAlertRule('removable_rule');
      
      const rules = errorTracker.getAlertRules();
      expect(rules.some(rule => rule.name === 'removable_rule')).toBe(false);
    });
  });

  describe('Error Statistics', () => {
    beforeEach(() => {
      // Add test errors
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      trackError(new ValidationError('Test 1'), { correlationId: 'test-1' });
      trackError(new DatabaseError('Test 2'), { correlationId: 'test-2' });
      
      // Simulate older error by manipulating timestamp
      const events = (errorTracker as any).errorEvents;
      const firstEvent = events.values().next().value;
      if (firstEvent) {
        firstEvent.timestamp = oneHourAgo;
      }
    });

    it('should filter errors by time range', () => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      const now = new Date();
      
      const stats = errorTracker.getErrorStats({
        start: thirtyMinutesAgo,
        end: now
      });
      
      // Should only include recent errors
      expect(stats.totalErrors).toBe(1);
    });

    it('should provide top errors by frequency', () => {
      // Add multiple occurrences of the same error
      const error = new ValidationError('Frequent error');
      
      for (let i = 0; i < 5; i++) {
        trackError(error, { correlationId: `test-${i}` });
      }

      const stats = errorTracker.getErrorStats();
      expect(stats.topErrors).toHaveLength(3); // 2 from beforeEach + 1 new
      expect(stats.topErrors[0].count).toBe(5); // Most frequent error
    });
  });
});