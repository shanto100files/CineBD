import {Platform} from 'react-native';

export type UiMode = 'auto' | 'mobile' | 'tv';

/**
 * UI layout override (Settings > Appearance > UI layout: auto/mobile/tv).
 *
 * v5.7.17 installed this from index.js BEFORE the app module tree evaluated.
 * That dragged the MMKV storage graph into the earliest bootstrap window and
 * hard-crashed phones on startup ("keeps stopping") — too early for any OTA
 * self-heal, so v5.7.18 removes the startup install entirely. The override is
 * now installed explicitly AFTER app init (App.tsx), and even then every step
 * is guarded: a storage failure just means "follow the real device".
 */

// Snapshot of the real device detection, taken when this module is first
// imported (post-init, long after RN is up). 'auto' mode keeps using it.
let realIsTV = false;
let realCaptured = false;

// Resolved once from storage, then memoized: the getter never re-enters
// require() on every Platform.isTV access. A restart applies changes fully.
let override: 'mobile' | 'tv' | null = null;
let resolved = false;

let installed = false;

const readOverride = (): 'mobile' | 'tv' | null => {
  if (resolved) {
    return override;
  }
  resolved = true;
  try {
    // Lazy require: the storage graph (MMKV) must already be up by the time
    // this runs — install happens after app init, never during bootstrap.
    const {settingsStorage} = require('./storage');
    const mode = settingsStorage.getUiMode();
    if (mode === 'mobile' || mode === 'tv') {
      override = mode;
    }
  } catch {
    // Storage unavailable — follow the real device detection.
    override = null;
  }
  return override;
};

/**
 * Make every Platform.isTV read follow the user's UI layout choice so the
 * whole app — app components AND third-party libraries — obeys it. Some
 * modules capture Platform.isTV at import time; those keep the native value
 * until the next cold start, so a restart applies the choice everywhere.
 *
 * Idempotent. Must NEVER be called during module evaluation — only after the
 * app is initialized (see App.tsx).
 */
export function installUiModeOverride(): void {
  if (installed) {
    return;
  }
  try {
    if (!realCaptured) {
      realIsTV = Platform.isTV === true;
      realCaptured = true;
    }
    Object.defineProperty(Platform, 'isTV', {
      configurable: true,
      enumerable: true,
      get() {
        const mode = readOverride();
        if (mode === 'tv') {
          return true;
        }
        if (mode === 'mobile') {
          return false;
        }
        return realIsTV;
      },
    });
    installed = true;
  } catch {
    // Never break the app over the override.
    installed = false;
  }
}

/** Test hook: uninstall the override and forget the memoized storage read. */
export function __resetUiModeForTests(): void {
  try {
    if (installed) {
      delete (Platform as any).isTV;
      // Restore RN's own data property from the platform constants.
      Object.defineProperty(Platform, 'isTV', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: realIsTV,
      });
    }
  } catch {}
  installed = false;
  resolved = false;
  override = null;
}
