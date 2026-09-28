import {AppState, Platform} from 'react-native';
import * as ExpoUpdates from 'expo-updates';
import {settingsStorage} from '../storage';
import {reportAppError} from './errorReporter';

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);

let downloading = false;
let lastCheckAt = 0;
const MIN_CHECK_INTERVAL_MS = 10 * 60 * 1000; // at most one check per 10 min

export interface OtaCheckResult {
  checked: boolean;
  available: boolean;
  downloading: boolean;
  critical: boolean;
  message?: string;
}

/**
 * Run one OTA check + download cycle. Called on cold start (from App.tsx)
 * and every time the app returns to the foreground — that is what makes
 * stuck devices pick up a new bundle without a manual restart race.
 *
 * Returns what happened so the caller can show progress/dialogs.
 * All failures are reported to the server (error reporter) and swallowed
 * locally — OTA must never crash the app.
 */
export const runOtaCheck = async (): Promise<OtaCheckResult> => {
  const idle: OtaCheckResult = {
    checked: false,
    available: false,
    downloading: false,
    critical: false,
  };
  try {
    if (!ExpoUpdates.isEnabled) return idle;
    if (downloading) return {...idle, downloading: true};
    if (AppState.currentState !== 'active') return idle;

    // Throttle foreground checks (cold start bypasses via lastCheckAt=0 reset).
    if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return idle;
    lastCheckAt = Date.now();

    if (!settingsStorage.isAutoCheckUpdateEnabled()) return idle;

    const check = await withTimeout(ExpoUpdates.checkForUpdateAsync(), 15000);
    if (!check.isAvailable) return idle;

    // Read server flags from the manifest extra block (set by ota_publish.sh).
    const manifest: any = (check as any).manifest || {};
    const extra: any = manifest.extra || {};
    const updateMeta: any = extra.ota || {};
    const isCritical = updateMeta.critical === true;
    const message = typeof updateMeta.message === 'string' ? updateMeta.message : undefined;

    if (!settingsStorage.isAutoDownloadEnabled() && !isCritical) {
      return {checked: true, available: true, downloading: false, critical: isCritical, message};
    }

    downloading = true;
    await withTimeout(ExpoUpdates.fetchUpdateAsync(), 120000);
    downloading = false;

    return {checked: true, available: true, downloading: false, critical: isCritical, message};
  } catch (e: any) {
    downloading = false;
    // Surface OTA failures to the site (best-effort, never throws).
    reportAppError({
      tag: 'ota',
      message: `OTA check/download failed: ${e?.message || e}`,
      fatal: false,
    });
    return idle;
  }
};

/** Reset the throttle (call once on cold start before the first check). */
export const resetOtaThrottle = () => {
  lastCheckAt = 0;
};
