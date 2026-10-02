import NetInfo from '@react-native-community/netinfo';
import {onlineManager} from '@tanstack/react-query';
import {useSyncExternalStore} from 'react';

/**
 * Bridges NetInfo to react-query's onlineManager so that:
 *  - offline: queries pause (cached/placeholder data still renders)
 *  - reconnect: `refetchOnReconnect: 'always'` fires app-wide
 * react-query's default online check (navigator.onLine) never works on RN.
 */

let currentOnline = true;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach(l => l());

export const initNetStatus = () => {
  onlineManager.setOnline(currentOnline);
  NetInfo.addEventListener(state => {
    const online = Boolean(
      state.isConnected && state.isInternetReachable !== false,
    );
    if (online !== currentOnline) {
      currentOnline = online;
      onlineManager.setOnline(online);
      notify();
    }
  });
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const useIsOffline = (): boolean =>
  !useSyncExternalStore(subscribe, () => currentOnline);

/**
 * Suppresses the floating "no internet" pill.
 *
 * The banner is rendered once at the app root with `zIndex: 1000`, so it
 * paints over the fullscreen player too — including while a DOWNLOADED file
 * is playing, which needs no network at all and should never be told the
 * internet is missing. The Player sets this for as long as it is mounted.
 */
let offlineNoticeSuppressed = false;

export const setOfflineNoticeSuppressed = (value: boolean): void => {
  if (value === offlineNoticeSuppressed) {
    return;
  }
  offlineNoticeSuppressed = value;
  notify();
};

export const useOfflineNoticeSuppressed = (): boolean =>
  useSyncExternalStore(subscribe, () => offlineNoticeSuppressed);
