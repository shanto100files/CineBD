/**
 * Tests for the Platform.isTV UI-mode override (Settings > Appearance > UI layout).
 * The override must make every Platform.isTV read follow the user's choice:
 * 'auto' -> real device detection, 'mobile' -> false, 'tv' -> true.
 *
 * Regression guard (v5.7.17 crash): importing the module must NOT install
 * anything and must NOT touch storage — installation is an explicit,
 * post-init call (App.tsx). Bootstrap stays storage-free.
 */
let mockMode = 'auto';
let mockStorageAvailable = true;
jest.mock('../src/lib/storage', () => ({
  settingsStorage: {
    getUiMode: () => {
      if (!mockStorageAvailable) {
        throw new Error('storage unavailable');
      }
      return mockMode;
    },
  },
}));

import {Platform} from 'react-native';
import {
  installUiModeOverride,
  __resetUiModeForTests,
} from '../src/lib/uiMode';

const fresh = fn => {
  __resetUiModeForTests();
  try {
    fn();
  } finally {
    __resetUiModeForTests();
  }
};

describe('uiMode Platform.isTV override', () => {
  test('importing the module does NOT install anything and does NOT read storage', () => {
    // Importing uiMode must stay storage-free: this is the v5.7.17 crash
    // regression (bootstrap pulled in MMKV before the app was up).
    mockStorageAvailable = false;
    const isTV = Platform.isTV;
    expect(isTV).toBe(false); // jest RN preset: non-TV device
    mockStorageAvailable = true;
  });

  test('install then auto follows the real device detection', () => {
    fresh(() => {
      mockMode = 'auto';
      installUiModeOverride();
      expect(Platform.isTV).toBe(false);
    });
  });

  test('install then tv forces the TV UI on any device', () => {
    fresh(() => {
      mockMode = 'tv';
      installUiModeOverride();
      expect(Platform.isTV).toBe(true);
    });
  });

  test('install then mobile forces the phone UI on any device', () => {
    fresh(() => {
      mockMode = 'mobile';
      installUiModeOverride();
      expect(Platform.isTV).toBe(false);
    });
  });

  test('storage failure after install falls back to device detection', () => {
    fresh(() => {
      mockStorageAvailable = false;
      installUiModeOverride();
      expect(() => Platform.isTV).not.toThrow();
      expect(Platform.isTV).toBe(false);
      mockStorageAvailable = true;
    });
  });

  test('install is idempotent (no double defineProperty)', () => {
    fresh(() => {
      mockMode = 'tv';
      installUiModeOverride();
      installUiModeOverride();
      installUiModeOverride();
      expect(Platform.isTV).toBe(true);
    });
  });
});
