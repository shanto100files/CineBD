/**
 * Tests for the Platform.isTV UI-mode override (Settings > Appearance > UI layout).
 * The override must make every Platform.isTV read follow the user's choice:
 * 'auto' -> real device detection, 'mobile' -> false, 'tv' -> true.
 */
let mockMode = 'auto';
jest.mock('../src/lib/storage', () => ({
  settingsStorage: {getUiMode: () => mockMode},
}));

import {Platform} from 'react-native';
// Self-installs the override on import (same as index.js does first).
import '../src/lib/uiMode';

describe('uiMode Platform.isTV override', () => {
  test('auto follows the real device detection', () => {
    mockMode = 'auto';
    // jest's RN preset reports a non-TV device.
    expect(Platform.isTV).toBe(false);
  });

  test('tv forces TV UI on any device', () => {
    mockMode = 'tv';
    expect(Platform.isTV).toBe(true);
  });

  test('mobile forces the phone UI on any device', () => {
    mockMode = 'mobile';
    expect(Platform.isTV).toBe(false);
  });

  test('falls back to device detection when storage is unavailable', () => {
    jest.isolateModules(() => {
      // Requiring the module again re-installs the override; with storage
      // mocked out entirely the getter must not throw.
      jest.doMock('../src/lib/storage', () => {
        throw new Error('storage unavailable');
      });
      require('../src/lib/uiMode');
      expect(() => Platform.isTV).not.toThrow();
    });
  });
});
