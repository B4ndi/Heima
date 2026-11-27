import { inviteLinkFor, WEBSITE } from '../links';

const dev = (path: string) => `exp://127.0.0.1:8081/--/${path}`;

describe('inviteLinkFor', () => {
  it('uses the https universal link in native store builds', () => {
    expect(inviteLinkFor('ABCDE-FGHJK', { native: true, expoGo: false }, dev)).toBe(`${WEBSITE}/bli-med/ABCDEFGHJK`);
  });
  it('keeps the development URL in Expo Go and on web', () => {
    expect(inviteLinkFor('ABCDE-FGHJK', { native: true, expoGo: true }, dev)).toBe('exp://127.0.0.1:8081/--/bli-med/ABCDEFGHJK');
    expect(inviteLinkFor('ABCDE-FGHJK', { native: false, expoGo: false }, dev)).toBe('exp://127.0.0.1:8081/--/bli-med/ABCDEFGHJK');
  });
  it('matches the path the website and the AASA file serve', () => {
    expect(inviteLinkFor('ABCDE-FGHJK', { native: true, expoGo: false }, dev)).toMatch(/^https:\/\/heimvis\.no\/bli-med\/[A-Z0-9]+$/);
  });
});
