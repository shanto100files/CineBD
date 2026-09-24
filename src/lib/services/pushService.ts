// FCM push wiring for promo/content notifications (MovieBox-style).
// Everything is optional: without google-services.json (or before the next
// native build) every accessor no-ops, so the app keeps working normally.
import {Platform} from 'react-native';
import axios from 'axios';
import {settingsStorage} from '../storage';

export const getMessaging = (): any | null => {
  try {
    return require('@react-native-firebase/messaging').default;
  } catch {
    return null;
  }
};

const TOKEN_KEY = 'fcmPushToken';
const REGISTERED_KEY = 'fcmPushRegistered';

/**
 * Register this device for push notifications:
 * FCM token -> cinepix.top so the server can target campaigns later.
 * Called from App.tsx once on startup.
 */
export const registerForPushNotifications = async (): Promise<void> => {
  try {
    const messaging = getMessaging();
    if (!messaging) {
      return;
    }

    // Android 13+ runtime permission (notifee's dialog is fine too; FCM only
    // needs the OS grant, not a separate one).
    const authStatus = await messaging.requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;
    if (!enabled) {
      return;
    }

    // User can opt out of promo pushes in settings.
    if (settingsStorage.getBool('promoPushDisabled')) {
      return;
    }

    const token = await messaging.getToken();
    if (!token) {
      return;
    }

    const cached = settingsStorage.getString(TOKEN_KEY);
    const alreadyRegistered = settingsStorage.getBool(REGISTERED_KEY);
    if (token === cached && alreadyRegistered) {
      return;
    }

    await axios.post(
      'https://cinepix.top/api/app/push/register',
      {
        token,
        platform: Platform.OS,
        appVersion: '',
      },
      {
        headers: {'X-App-Key': '78a0e573dfd894d443685159b2e71e2f'},
        timeout: 10000,
      },
    );

    settingsStorage.setString(TOKEN_KEY, token);
    settingsStorage.setBool(REGISTERED_KEY, true);
  } catch (error) {
    console.warn('[Push] registration failed:', error);
  }
};

/**
 * Token refresh handler (FCM rotates tokens occasionally).
 */
export const onTokenRefresh = (handler: (token: string) => void): (() => void) => {
  const messaging = getMessaging();
  if (!messaging) {
    return () => undefined;
  }
  return messaging.onTokenRefresh(handler);
};

export const resetPushRegistration = (): void => {
  settingsStorage.setBool(REGISTERED_KEY, false);
};
