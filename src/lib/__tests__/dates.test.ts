import { parseLocal, todayIn } from '../dates';

describe('parseLocal', () => {
  it('parses valid local date/time', () => {
    const d = parseLocal('2026-12-24', '18:30')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 24, 18, 30]);
  });
  it('rejects impossible dates and times', () => {
    expect(parseLocal('2026-02-30', '12:00')).toBeNull();
    expect(parseLocal('2026-12-24', '25:00')).toBeNull();
    expect(parseLocal('24.12.2026', '12:00')).toBeNull();
  });
});

describe('todayIn (matches the database: chores use the household time zone)', () => {
  it('rolls over at local midnight, not UTC midnight', () => {
    expect(todayIn('Europe/Oslo', new Date('2026-11-25T22:59:59Z'))).toBe('2026-11-25');
    expect(todayIn('Europe/Oslo', new Date('2026-11-25T23:00:00Z'))).toBe('2026-11-26');
    expect(todayIn('Europe/Oslo', new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
    expect(todayIn('UTC', new Date('2026-11-25T23:00:00Z'))).toBe('2026-11-25');
  });
  it('falls back to the device zone for an unknown zone', () => {
    expect(todayIn('Mars/Olympus_Mons', new Date(2026, 0, 2, 12))).toBe('2026-01-02');
    expect(todayIn(undefined, new Date(2026, 0, 2, 12))).toBe('2026-01-02');
  });
});
