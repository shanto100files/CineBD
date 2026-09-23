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
