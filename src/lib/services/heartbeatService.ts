import {Platform} from 'react-native';
import {Application} from 'expo-application';
import {mainStorage as storage} from '../storage/StorageService';
import useAuthStore from '../zustand/authStore';

const API = 'https://cinepix.top/api/app';
const LAST_HEARTBEAT_KEY = '@last_heartbeat';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000;

export async function sendHeartbeat() {
  const token = useAuthStore.getState().token;
  if (!token) return;

  const lastHB = storage.getNumber(LAST_HEARTBEAT_KEY) || 0;
  if (Date.now() - lastHB < HEARTBEAT_INTERVAL) return;

  try {
    const version = Application.nativeApplicationVersion ?? 'unknown';
    const device = `${Platform.OS}/${Platform.Version}`;
    await fetch(`${API}/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-App-Version': version,
        'X-Device-Info': device,
      },
      body: JSON.stringify({}),
    });
    storage.set(LAST_HEARTBEAT_KEY, Date.now());
  } catch {}
}
