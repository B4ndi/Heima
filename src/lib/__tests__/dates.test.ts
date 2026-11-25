import { parseLocal } from '../dates';

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
