import {
  validatePause,
  countFridays,
  countBusinessDays,
  calendarDaysInRange,
  getPauseDaysLimit,
  type PauseValidationInput,
} from '../../src/utils/pauseRules.js';

describe('Pause Rules Utility', () => {
  // Use a fixed "now" for all tests: Monday June 1 2026
  const now = new Date('2026-06-01T10:00:00Z');

  const baseInput: PauseValidationInput = {
    subscriptionStatus: 'active',
    durationDays: 12,
    pauseDaysUsed: 0,
    pauseDaysLimit: 3,
    pauseStart: new Date('2026-06-03'), // Wednesday (>= tomorrow)
    pauseEnd: new Date('2026-06-05'),   // Friday — 3 calendar days
  };

  describe('getPauseDaysLimit', () => {
    it('returns 3 for 12-day package', () => {
      expect(getPauseDaysLimit(12)).toBe(3);
    });

    it('returns 6 for 18-day package', () => {
      expect(getPauseDaysLimit(18)).toBe(6);
    });

    it('returns 10 for 24-day package', () => {
      expect(getPauseDaysLimit(24)).toBe(10);
    });

    it('returns 0 for unknown duration', () => {
      expect(getPauseDaysLimit(7)).toBe(0);
    });
  });

  describe('countFridays', () => {
    it('counts Fridays in a range', () => {
      // June 1 (Mon) to June 7 (Sun) — 1 Friday (June 5)
      expect(countFridays(new Date('2026-06-01'), new Date('2026-06-07'))).toBe(1);
    });

    it('counts multiple Fridays', () => {
      // June 1 to June 14 — 2 Fridays (June 5, June 12)
      expect(countFridays(new Date('2026-06-01'), new Date('2026-06-14'))).toBe(2);
    });

    it('returns 0 when no Fridays', () => {
      // Mon June 1 to Thu June 4
      expect(countFridays(new Date('2026-06-01'), new Date('2026-06-04'))).toBe(0);
    });

    it('counts Friday on exact start/end', () => {
      // Friday June 5 to Friday June 5
      expect(countFridays(new Date('2026-06-05'), new Date('2026-06-05'))).toBe(1);
    });
  });

  describe('countBusinessDays', () => {
    it('excludes Fridays from count', () => {
      // Wed Jun 3 to Fri Jun 5 = 3 calendar days, 1 Friday → 2 business days
      expect(countBusinessDays(new Date('2026-06-03'), new Date('2026-06-05'))).toBe(2);
    });

    it('all business days when no Friday in range', () => {
      // Mon Jun 1 to Wed Jun 3 = 3 days, 0 Fridays → 3 business days
      expect(countBusinessDays(new Date('2026-06-01'), new Date('2026-06-03'))).toBe(3);
    });

    it('single day', () => {
      expect(countBusinessDays(new Date('2026-06-01'), new Date('2026-06-01'))).toBe(1);
    });

    it('single Friday = 0 business days', () => {
      expect(countBusinessDays(new Date('2026-06-05'), new Date('2026-06-05'))).toBe(0);
    });
  });

  describe('calendarDaysInRange', () => {
    it('counts inclusive days', () => {
      expect(calendarDaysInRange(new Date('2026-06-01'), new Date('2026-06-05'))).toBe(5);
    });

    it('single day = 1', () => {
      expect(calendarDaysInRange(new Date('2026-06-01'), new Date('2026-06-01'))).toBe(1);
    });
  });

  describe('validatePause', () => {
    it('R11.AC2: valid pause within limits', () => {
      const result = validatePause(baseInput, now);

      expect(result.valid).toBe(true);
      expect(result.businessDays).toBe(2); // Wed, Thu (Fri excluded)
      expect(result.calendarDays).toBe(3); // Wed, Thu, Fri
      expect(result.extensionDays).toBe(3); // R11.AC5: calendar days
    });

    it('R11.AC3: rejects when not active', () => {
      const result = validatePause({ ...baseInput, subscriptionStatus: 'paused' }, now);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PAUSE_NOT_ACTIVE');
    });

    it('R11.AC3: rejects when already paused', () => {
      const result = validatePause({ ...baseInput, subscriptionStatus: 'paused' }, now);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PAUSE_NOT_ACTIVE');
    });

    it('R11.AC3: rejects insufficient notice (< 24h)', () => {
      const result = validatePause(
        { ...baseInput, pauseStart: new Date('2026-06-01') }, // same day as now
        now
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PAUSE_INSUFFICIENT_NOTICE');
    });

    it('R11.AC3: rejects when exceeding limit', () => {
      const result = validatePause(
        {
          ...baseInput,
          pauseDaysUsed: 2, // already used 2 of 3
          pauseStart: new Date('2026-06-03'),
          pauseEnd: new Date('2026-06-04'), // 2 more business days → total 4 > 3
        },
        now
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PAUSE_LIMIT_EXCEEDED');
    });

    it('R11.AC2: accepts pause that exactly hits the limit', () => {
      const result = validatePause(
        {
          ...baseInput,
          pauseDaysUsed: 1,
          pauseStart: new Date('2026-06-03'), // Wed
          pauseEnd: new Date('2026-06-04'),   // Thu — 2 business days, total = 3 = limit
        },
        now
      );

      expect(result.valid).toBe(true);
      expect(result.businessDays).toBe(2);
    });

    it('R11.AC5: extensionDays = calendar days (includes Fridays)', () => {
      // Mon Jun 8 to Sun Jun 14 = 7 calendar days, 1 Friday
      const result = validatePause(
        {
          subscriptionStatus: 'active',
          durationDays: 24,
          pauseDaysUsed: 0,
          pauseDaysLimit: 10,
          pauseStart: new Date('2026-06-08'), // Monday
          pauseEnd: new Date('2026-06-14'),   // Sunday
        },
        now
      );

      expect(result.valid).toBe(true);
      expect(result.businessDays).toBe(6); // Mon-Sun excluding Friday = 6
      expect(result.calendarDays).toBe(7);
      expect(result.extensionDays).toBe(7); // calendar days including Friday
    });

    it('rejects invalid range (end before start)', () => {
      const result = validatePause(
        {
          ...baseInput,
          pauseStart: new Date('2026-06-05'),
          pauseEnd: new Date('2026-06-03'),
        },
        now
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PAUSE_INVALID_RANGE');
    });

    it('handles 18-day package limits', () => {
      const result = validatePause(
        {
          subscriptionStatus: 'active',
          durationDays: 18,
          pauseDaysUsed: 5,
          pauseDaysLimit: 6,
          pauseStart: new Date('2026-06-03'), // Wed
          pauseEnd: new Date('2026-06-03'),   // Wed — 1 business day
        },
        now
      );

      expect(result.valid).toBe(true);
      expect(result.businessDays).toBe(1);
    });

    it('expired subscription cannot be paused', () => {
      const result = validatePause({ ...baseInput, subscriptionStatus: 'expired' }, now);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PAUSE_NOT_ACTIVE');
    });
  });
});
