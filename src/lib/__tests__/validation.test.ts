import { formatCode, schemas } from '../validation';

describe('invite codes', () => {
  it('accepts display and lower-case forms', () => {
    expect(schemas.inviteCode.parse('k7qxm-3fhra')).toBe('K7QXM3FHRA');
    expect(schemas.inviteCode.parse(' K7QXM 3FHRA ')).toBe('K7QXM3FHRA');
  });
  it('rejects look-alike characters that are never generated', () => {
    for (const bad of ['O7QXM3FHRA', 'I7QXM3FHRA', '07QXM3FHRA', '17QXM3FHRA']) {
      expect(schemas.inviteCode.safeParse(bad).success).toBe(false);
    }
  });
  it('rejects wrong length and injection attempts', () => {
    expect(schemas.inviteCode.safeParse('ABCDE').success).toBe(false);
    expect(schemas.inviteCode.safeParse("'; drop table--").success).toBe(false);
  });
  it('formats codes', () => expect(formatCode('k7qxm3fhra')).toBe('K7QXM-3FHRA'));
});

describe('text limits mirror DB constraints', () => {
  it('trims and rejects empty', () => expect(schemas.postBody.safeParse('   ').success).toBe(false));
  it('enforces max length', () => {
    expect(schemas.postBody.safeParse('x'.repeat(4000)).success).toBe(true);
    expect(schemas.postBody.safeParse('x'.repeat(4001)).success).toBe(false);
  });
  it('requires 2–10 poll options', () => {
    expect(schemas.pollOptions.safeParse(['Ja']).success).toBe(false);
    expect(schemas.pollOptions.safeParse(['Ja', 'Nei']).success).toBe(true);
    expect(schemas.pollOptions.safeParse(Array(11).fill('x')).success).toBe(false);
  });
  it('validates OTP codes', () => {
    expect(schemas.otp.safeParse('12345678').success).toBe(true);
    expect(schemas.otp.safeParse('12ab').success).toBe(false);
  });
});

describe('moderation and time zone inputs', () => {
  it('limits report details to 500 characters', () => {
    expect(schemas.reportDetails.parse('  hei  ')).toBe('hei');
    expect(schemas.reportDetails.safeParse('x'.repeat(501)).success).toBe(false);
  });
  it('accepts IANA zone names and rejects junk', () => {
    expect(schemas.timezone.parse(' Europe/Oslo ')).toBe('Europe/Oslo');
    expect(schemas.timezone.safeParse('America/Argentina/Buenos_Aires').success).toBe(true);
    expect(schemas.timezone.safeParse("Europe/Oslo'; --").success).toBe(false);
    expect(schemas.timezone.safeParse('').success).toBe(false);
  });
});
