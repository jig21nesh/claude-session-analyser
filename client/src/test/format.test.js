import { describe, it, expect } from 'vitest';
import {
  formatMoney, formatTokens, formatCount, formatDuration, shortDate,
} from '../utils/format.js';

describe('formatMoney', () => {
  it('should format dollars with two decimals', () => {
    expect(formatMoney(12.3456)).toBe('$12.35');
    expect(formatMoney(0)).toBe('$0.00');
  });
  it('should compact thousands when asked', () => {
    expect(formatMoney(12345, { compact: true })).toBe('$12.3k');
  });
  it('should tolerate junk input', () => {
    expect(formatMoney(undefined)).toBe('$0.00');
    expect(formatMoney('nope')).toBe('$0.00');
  });
});

describe('formatTokens', () => {
  it('should scale to k/M/B', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(2500000)).toBe('2.5M');
    expect(formatTokens(3200000000)).toBe('3.20B');
  });
});

describe('formatCount', () => {
  it('should add thousands separators', () => {
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});

describe('formatDuration', () => {
  it('should format minutes, hours and days', () => {
    expect(formatDuration('2026-07-01T10:00:00Z', '2026-07-01T10:45:00Z')).toBe('45m');
    expect(formatDuration('2026-07-01T10:00:00Z', '2026-07-01T13:30:00Z')).toBe('3h 30m');
    expect(formatDuration('2026-07-01T10:00:00Z', '2026-07-04T10:00:00Z')).toBe('3d 0h');
  });
  it('should return a dash for missing or reversed ranges', () => {
    expect(formatDuration(null, '2026-07-01T10:00:00Z')).toBe('—');
    expect(formatDuration('2026-07-02T10:00:00Z', '2026-07-01T10:00:00Z')).toBe('—');
  });
});

describe('shortDate', () => {
  it('should render day and month', () => {
    expect(shortDate('2026-07-11')).toBe('11 Jul');
  });
});
