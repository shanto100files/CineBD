import {Platform} from 'react-native';

export type UiMode = 'auto' | 'mobile' | 'tv';

/**
 * Reads the UI mode override without touching MMKV until it is first needed.
 * 'auto' (default) follows the real device detection (Platform.isTV).
 */
const readUiMode = (): UiMode => {
  try {
    // Lazy require: settings storage (MMKV) must not load before the app
    // bootstrap is ready — index.js imports this module first.
    const {settingsStorage} = require('./storage');
    const mode = settingsStorage.getUiMode();
    if (mode === 'mobile' || mode === 'tv') {
      return mode;
    }
  } catch {
    // Storage unavailable — fall back to real device detection.
  }
  return 'auto';
};

/**
 * Overrides React Native's Platform.isTV with the user's UI mode choice so
 * every existing call site — app components AND third-party libraries —
 * follows it. Some modules capture Platform.isTV at import time, so a full
 * app restart guarantees the layout is applied everywhere.
 *
 * Must be installed before the app module tree evaluates (see index.js).
 */
export function installUiModeOverride(): void {
  try {
    // Snapshot the real device detection once; the 'auto' mode keeps using it.
    const realIsTV = Platform.isTV;
    Object.defineProperty(Platform, 'isTV', {
      configurable: true,
      enumerable: true,
      get() {
        const mode = readUiMode();
        if (mode === 'tv') {
          return true;
        }
        if (mode === 'mobile') {
          return false;
        }
        return realIsTV;
      },
    });
  } catch {
    // Never break startup over the override.
  }
}

installUiModeOverride();
