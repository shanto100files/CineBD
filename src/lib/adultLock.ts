import * as LocalAuthentication from 'expo-local-authentication';
import * as ExpoCrypto from 'expo-crypto';
import {mainStorage} from './storage/StorageService';

/**
 * 18+ content lock — PIN + optional device biometrics.
 *
 * Flow:
 *  - Enabling 18+ requires the user to SET a PIN (hashed with SHA-256 via
 *    expo-crypto, never stored in plaintext) and optionally enrol biometrics.
 *  - Turning 18+ ON (and re-authenticating when stale) requires the PIN or a
 *    successful biometric prompt.
 *  - Disabling 18+ always requires the PIN (child-proofing: a kid that knows
 *    the toggle can't just switch it off without the PIN).
 */

const PIN_KEY = 'adult:pin-hash';
const BIOMETRIC_KEY = 'adult:biometric';
const UNLOCK_TS_KEY = 'adult:unlocked-ts';
/** Re-prompt after 15 minutes of app use. */
const UNLOCK_TTL_MS = 15 * 60 * 1000;

export const isAdultPinSet = (): boolean => {
  try {
    return mainStorage.contains(PIN_KEY);
  } catch {
    return false;
  }
};

export const isBiometricEnabled = (): boolean => {
  try {
    return mainStorage.getBool(BIOMETRIC_KEY, false);
  } catch {
    return false;
  }
};

export const setBiometricEnabled = (on: boolean): void => {
  try {
    mainStorage.setBool(BIOMETRIC_KEY, on);
  } catch {}
};

async function sha256(text: string): Promise<string> {
  return ExpoCrypto.digestStringAsync(ExpoCrypto.CryptoDigestAlgorithm.SHA256, text);
}

/** Set/replace the 18+ PIN. Returns true on success. */
export const setAdultPin = async (pin: string): Promise<boolean> => {
  const clean = String(pin || '').trim();
  if (!/^\d{4,8}$/.test(clean)) return false;
  try {
    mainStorage.setString(PIN_KEY, await sha256('cinepix:' + clean));
    return true;
  } catch {
    return false;
  }
};

/** Verify a PIN attempt. */
export const verifyAdultPin = async (pin: string): Promise<boolean> => {
  const stored = (() => {
    try {
      return mainStorage.getString(PIN_KEY);
    } catch {
      return undefined;
    }
  })();
  if (!stored) return false;
  try {
    return (await sha256('cinepix:' + String(pin || '').trim())) === stored;
  } catch {
    return false;
  }
};

/** Clear the lock entirely (disable protection). */
export const clearAdultLock = (): void => {
  try {
    mainStorage.delete(PIN_KEY);
    mainStorage.delete(BIOMETRIC_KEY);
    mainStorage.delete(UNLOCK_TS_KEY);
  } catch {}
};

export const hasBiometricHardware = async (): Promise<boolean> => {
  try {
    const [hasHw, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHw && enrolled;
  } catch {
    return false;
  }
};

/**
 * Prompt device biometrics (fingerprint/face). Resolves true on success.
 * No-op false when biometrics are unavailable/disabled for the lock.
 */
export const promptBiometric = async (): Promise<boolean> => {
  if (!isBiometricEnabled()) return false;
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: '18+ আনলক করতে ফিঙ্গারপ্রিন্ট দিন',
      cancelLabel: 'বাতিল',
      // Allow the system PIN/pattern as a fallback so a rejected finger or
      // a flaky sensor never dead-ends the user — they can still get in.
      disableDeviceFallback: false,
      fallbackLabel: 'পিন ব্যবহার করুন',
    });
    return res.success === true;
  } catch {
    return false;
  }
};

/** Session-level unlock timestamp handling. */
const isUnlockedFresh = (): boolean => {
  try {
    const ts = mainStorage.getNumber(UNLOCK_TS_KEY) || 0;
    return Date.now() - ts < UNLOCK_TTL_MS;
  } catch {
    return false;
  }
};

export const markUnlocked = (): void => {
  try {
    mainStorage.setNumber(UNLOCK_TS_KEY, Date.now());
  } catch {}
};

/**
 * Timestamp of the last successful unlock (0 = never). Callers that open the
 * lock screen compare this against the time they opened it, so a cancel
 * cannot ride on an older session's fresh-unlock window.
 */
export const getUnlockedAt = (): number => {
  try {
    return mainStorage.getNumber(UNLOCK_TS_KEY) || 0;
  } catch {
    return 0;
  }
};

/**
 * Whether 18+ can currently be accessed without prompting (fresh unlock).
 * If no PIN is set at all the lock is inert (legacy behaviour).
 */
export const isAdultLockOpen = (): boolean => {
  if (!isAdultPinSet()) return true;
  return isUnlockedFresh();
};

export const ADULT_PIN_MIN = 4;
export const ADULT_PIN_MAX = 8;
