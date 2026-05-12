/**
 * Pause rules engine for FLOD subscriptions.
 *
 * R11.AC2: Validate pause against max days per duration, Fridays excluded from count, 24h notice.
 * R11.AC3: Specific error codes for failed validation.
 * R11.AC5: End date extended by calendar days (including Fridays).
 */

const PAUSE_LIMITS: Record<number, number> = { 12: 3, 18: 6, 24: 10 };

export interface PauseValidationInput {
  subscriptionStatus: string;
  durationDays: number;
  pauseDaysUsed: number;
  pauseDaysLimit: number;
  pauseStart: Date; // requested pause start
  pauseEnd: Date; // requested pause end (inclusive)
}

export interface PauseValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  businessDays?: number; // pause days counted (Fridays excluded)
  calendarDays?: number; // total calendar days in the range
  extensionDays?: number; // how many days to extend end_date (R11.AC5: calendar days)
}

/** Count Fridays in a date range [start, end] inclusive */
export function countFridays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    if (current.getDay() === 5) count++; // Friday = 5
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/** Count business days (excluding Fridays) in [start, end] inclusive */
export function countBusinessDays(start: Date, end: Date): number {
  const calendarDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const fridays = countFridays(start, end);
  return calendarDays - fridays;
}

/** Calculate calendar days in [start, end] inclusive */
export function calendarDaysInRange(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/** Get the pause_days_limit for a given package duration */
export function getPauseDaysLimit(durationDays: number): number {
  return PAUSE_LIMITS[durationDays] ?? 0;
}

/**
 * Validate a pause request against all rules.
 * @param input - subscription data + requested pause range
 * @param now - current date/time (injectable for testing)
 */
export function validatePause(input: PauseValidationInput, now: Date = new Date()): PauseValidationResult {
  // 1. Subscription must be active
  if (input.subscriptionStatus !== 'active') {
    return {
      valid: false,
      error: 'Subscription must be active to pause',
      errorCode: 'PAUSE_NOT_ACTIVE',
    };
  }

  // 2. Already paused check is handled by status check above (status would be 'paused')

  // 3. 24h notice: pauseStart must be >= tomorrow
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const pauseStartDay = new Date(input.pauseStart);
  pauseStartDay.setHours(0, 0, 0, 0);

  if (pauseStartDay < tomorrow) {
    return {
      valid: false,
      error: 'Pause must start at least 24 hours from now',
      errorCode: 'PAUSE_INSUFFICIENT_NOTICE',
    };
  }

  // 4. pauseEnd must be >= pauseStart
  const pauseEndDay = new Date(input.pauseEnd);
  pauseEndDay.setHours(0, 0, 0, 0);

  if (pauseEndDay < pauseStartDay) {
    return {
      valid: false,
      error: 'Pause end must be on or after pause start',
      errorCode: 'PAUSE_INVALID_RANGE',
    };
  }

  // 5. Count business days (Fridays excluded from pause day count)
  const businessDays = countBusinessDays(pauseStartDay, pauseEndDay);
  const calendarDays = calendarDaysInRange(pauseStartDay, pauseEndDay);

  // 6. Check against limit
  if (input.pauseDaysUsed + businessDays > input.pauseDaysLimit) {
    return {
      valid: false,
      error: `Pause would exceed limit (${input.pauseDaysUsed} used + ${businessDays} requested > ${input.pauseDaysLimit} limit)`,
      errorCode: 'PAUSE_LIMIT_EXCEEDED',
    };
  }

  // R11.AC5: Extension = calendar days (including Fridays)
  return {
    valid: true,
    businessDays,
    calendarDays,
    extensionDays: calendarDays,
  };
}
