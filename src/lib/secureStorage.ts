import AsyncStorage from '@react-native-async-storage/async-storage';
import { AESEncryptionKey, AESKeySize, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Encrypted session storage (MASVS-STORAGE-1).
 *
 * Supabase sessions (access + refresh token) are larger than the ~2 KB that
 * Keychain/Keystore entries comfortably hold, so we use envelope encryption:
 *   - a random AES-256 key per storage key lives in SecureStore
 *     (iOS Keychain, WHEN_UNLOCKED_THIS_DEVICE_ONLY; Android Keystore-backed,
 *     excluded from backups)
 *   - the session is encrypted with AES-256-GCM (authenticated) and the
 *     ciphertext is stored in AsyncStorage.
 * Tampered or undecryptable data is discarded, forcing a fresh sign-in.
 *
 * Web is supported only for local development/testing and uses sessionStorage
 * (cleared when the tab closes). The production target is iOS/Android.
 */

const PREFIX = 'heima.enc.';
const keyName = (key: string) => `heima_k_${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return globalThis.btoa(bin);
}

function base64ToUtf8(b64: string): string {
  const bin = globalThis.atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getOrCreateKey(key: string): Promise<AESEncryptionKey> {
  const stored = await SecureStore.getItemAsync(keyName(key), SECURE_OPTS);
  if (stored) return AESEncryptionKey.import(stored, 'base64');
  const fresh = await AESEncryptionKey.generate(AESKeySize.AES256);
  await SecureStore.setItemAsync(keyName(key), await fresh.encoded('base64'), SECURE_OPTS);
  return fresh;
}

const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    const sealed = await AsyncStorage.getItem(PREFIX + key);
    if (!sealed) return null;
    try {
      const stored = await SecureStore.getItemAsync(keyName(key), SECURE_OPTS);
      if (!stored) throw new Error('missing key');
      const aesKey = await AESEncryptionKey.import(stored, 'base64');
      const plain = await aesDecryptAsync(AESSealedData.fromCombined(sealed), aesKey, { output: 'base64' });
      return base64ToUtf8(plain);
    } catch {
      // Key lost (e.g. restored backup on a new device) or data tampered with.
      await nativeStorage.removeItem(key);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const aesKey = await getOrCreateKey(key);
    const sealed = await aesEncryptAsync(utf8ToBase64(value), aesKey);
    await AsyncStorage.setItem(PREFIX + key, await sealed.combined('base64'));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(PREFIX + key);
    await SecureStore.deleteItemAsync(keyName(key), SECURE_OPTS);
  },
};

const webStorage = {
  async getItem(key: string) {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string) {
    globalThis.sessionStorage?.setItem(key, value);
  },
  async removeItem(key: string) {
    globalThis.sessionStorage?.removeItem(key);
  },
};

export const secureSessionStorage = Platform.OS === 'web' ? webStorage : nativeStorage;
