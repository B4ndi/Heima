import { fmt, isoToInputDate, parseInputDate, parseLocal, todayIn } from '../dates';

describe('parseLocal', () => {
  it('parses valid local date/time (DD.MM.YYYY)', () => {
    const d = parseLocal('24.12.2026', '18:30')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 11, 24, 18, 30]);
  });
  it('rejects impossible dates and times', () => {
    expect(parseLocal('30.02.2026', '12:00')).toBeNull();
    expect(parseLocal('24.12.2026', '25:00')).toBeNull();
    expect(parseLocal('2026-12-24', '12:00')).toBeNull();
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

describe('DD.MM.YYYY date fields', () => {
  it('parses typed dates into ISO dates for the database', () => {
    expect(parseInputDate('28.11.2026')).toBe('2026-11-28');
    expect(parseInputDate(' 1.2.2026 ')).toBe('2026-02-01');
    expect(parseInputDate('01-02-2026')).toBe('2026-02-01');
    expect(parseInputDate('29.02.2028')).toBe('2028-02-29');
  });
  it('rejects impossible or wrongly ordered dates', () => {
    expect(parseInputDate('29.02.2026')).toBeNull();
    expect(parseInputDate('31.04.2026')).toBeNull();
    expect(parseInputDate('2026-11-28')).toBeNull();
    expect(parseInputDate('11/28/2026')).toBeNull();
  });
  it('formats ISO dates for fields and display', () => {
    expect(isoToInputDate('2026-11-28')).toBe('28.11.2026');
    expect(fmt.date('2026-11-28')).toBe('28.11.2026');
    expect(fmt.inputDate(new Date(2026, 0, 5))).toBe('05.01.2026');
  });
});
