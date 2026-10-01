/**
 * @format
 */

import {AppRegistry} from 'react-native';
// NOTE: do NOT import uiMode here. Installing the Platform.isTV override
// during bootstrap (v5.7.17) pulled the MMKV storage graph into the earliest
// startup window and hard-crashed the app before any UI/error reporting.
// The override installs after app init from App.tsx instead.
import App from './src/App';
import notifee from '@notifee/react-native';

// import notificationService from './src/lib/services/Notification';

// Enable react-native-firebase debug mode for Analytics DebugView in dev
if (__DEV__) {
  // eslint-disable-next-line no-undef
  globalThis.RNFBDebug = true;
}

notifee.onBackgroundEvent(async ({type, detail}) => {
  const notificationService =
    require('./src/lib/services/Notification').default;
  await notificationService.actionHandler({type, detail});
});

notifee.registerForegroundService(async () => {
  // Keep the service alive while in foreground
  return new Promise(() => {});
});

AppRegistry.registerComponent('main', () => App);
