import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/** The public website. Hosts the universal-link file (`/.well-known/apple-app-site-association`). */
export const WEBSITE = 'https://heimvis.no';

const invitePath = (code: string) => `bli-med/${code.replace(/-/g, '')}`;

/**
 * Invite link for a household code.
 *
 * Store/TestFlight builds share an https universal link: iOS only opens the app for it after
 * verifying the domain's association file, so another app cannot claim it the way it can
 * claim a custom scheme (heimvis://). Expo Go and the web build cannot receive universal
 * links, so they keep the development URL from `createURL` (exp://… or the web origin).
 */
export function inviteLinkFor(code: string, ctx: { native: boolean; expoGo: boolean }, devUrl: (path: string) => string): string {
  return ctx.native && !ctx.expoGo ? `${WEBSITE}/${invitePath(code)}` : devUrl(invitePath(code));
}

export function inviteLink(code: string): string {
  return inviteLinkFor(
    code,
    { native: Platform.OS !== 'web', expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient },
    (path) => Linking.createURL(path),
  );
}
