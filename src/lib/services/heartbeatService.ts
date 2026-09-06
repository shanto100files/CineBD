import {Platform} from 'react-native';
import {Application} from 'expo-application';
import * as ApplicationExpo from 'expo-application';
import {mainStorage as storage} from '../storage/StorageService';
import useAuthStore from '../zustand/authStore';

const API = 'https://cinepix.top/api/app';
const LAST_HEARTBEAT_KEY = '@last_heartbeat';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000;
const DEVICE_ID_KEY = '@device_id';

export function getDeviceId(): string {
  let id = storage.getString(DEVICE_ID_KEY);
  if (!id) {
    const androidId = ApplicationExpo.getAndroidId?.() ?? '';
    const appName = 'cinebd';
    id = `${appName}_${androidId || Date.now().toString(36)}`;
    storage.set(DEVICE_ID_KEY, id);
  }
  return id;
}

export async function sendHeartbeat() {
  const lastHB = storage.getNumber(LAST_HEARTBEAT_KEY) || 0;
  if (Date.now() - lastHB < HEARTBEAT_INTERVAL) return;

  try {
    const version = Application.nativeApplicationVersion ?? 'unknown';
    const device = `${Platform.OS}/${Platform.Version}`;
    const deviceId = getDeviceId();
    const token = useAuthStore.getState().token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-App-Version': version,
      'X-Device-Info': device,
      'X-Device-Id': deviceId,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    await fetch(`${API}/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });
    storage.set(LAST_HEARTBEAT_KEY, Date.now());
  } catch {}
}
