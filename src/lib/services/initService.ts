import {extensionManager} from './ExtensionManager';
import useContentStore from '../zustand/contentStore';
import {mainStorage as storage} from '../storage/StorageService';
import {settingsStorage} from '../storage';
import * as Application from 'expo-application';
import {getDeviceId} from './heartbeatService';
import {getGatedInstalledProviders} from '../utils/providerGate';
import axios from 'axios';

export interface InitProgress {
  progress: number;
  status: string;
}

const KILL_SWITCH_KEY = '@app_kill_key';
export const HARDCODED_KILL_KEY = '78a0e573dfd894d443685159b2e71e2f';
const API_BASE = 'https://cinepix.top/api/app';

export function compareVersions(local: string, min: string): boolean {
  if (!local || !min) return false;
  const l = local.split('.').map(v => parseInt(v, 10) || 0);
  const m = min.split('.').map(v => parseInt(v, 10) || 0);

  for (let i = 0; i < Math.max(l.length, m.length); i++) {
    const lNum = l[i] || 0;
    const mNum = m[i] || 0;
    if (lNum < mNum) return true;
    if (lNum > mNum) return false;
  }
  return false;
}

export async function checkForceUpdateOnly(): Promise<boolean> {
  try {
      const vRes = await axios.get(`${API_BASE}/versioncheck`, {
        timeout: 15000,
        headers: {
          'X-App-Key': HARDCODED_KILL_KEY
        }
      });
    const { min_version, force_update } = vRes.data;
    if (force_update == true || force_update == 1) {
      const currentVersion = Application.nativeApplicationVersion || '0.0.0';
      return compareVersions(currentVersion, min_version);
    }
    return false;
  } catch {
    return false;
  }
}

async function checkKillSwitch(): Promise<{blocked: boolean; shutdown?: boolean; reason?: string}> {
  try {
    const storedKey = storage.getString(KILL_SWITCH_KEY) || HARDCODED_KILL_KEY;
    const version = Application.nativeApplicationVersion ?? '0.0.0';
    const deviceId = getDeviceId();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch(`${API_BASE}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Key': HARDCODED_KILL_KEY
        },
        body: JSON.stringify({key: storedKey, version, device_id: deviceId}),
        signal: controller.signal,
      });

      if (!res.ok) {
        return {blocked: true, reason: 'Access Denied (Security Server Error)'};
      }

      const data = await res.json();
      return {
        blocked: data.blocked === true,
        shutdown: data.shutdown === true,
        reason: data.reason || 'অ্যাপটি বর্তমানে মেইনটেন্যান্সের অধীনে আছে। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।'
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return {blocked: false, shutdown: false};
  }
}

export async function initializeApp(
  onProgress: (p: InitProgress) => void,
): Promise<{forceUpdate?: boolean; blocked?: boolean; reason?: string}> {
  try {
    onProgress({progress: 5, status: 'Verifying session...'});
    onProgress({progress: 15, status: 'Checking for updates...'});
    const [check, forceUpdateNeeded] = await Promise.all([
      checkKillSwitch(),
      checkForceUpdateOnly(),
    ]);

    // 1. Kill Switch Check
    if (check.shutdown || check.blocked) {
      return { blocked: true, reason: check.reason };
    }

    // 2. Force Update Check
    if (forceUpdateNeeded) {
      return { forceUpdate: true };
    }

    // Normal Initialization
    onProgress({progress: 30, status: 'Initializing engine...'});
    try {
      await withTimeout(extensionManager.fetchManifest(undefined, true), 10000);
    } catch {}

    onProgress({progress: 60, status: 'Loading providers...'});
    try {
      await withTimeout(extensionManager.initialize(), 10000);
    } catch {}

    // 18+ gating: hide adult providers unless the age gate was passed.
    const adultAllowed = settingsStorage.isAdultEnabled();
    const installed = getGatedInstalledProviders();
    useContentStore.setState({installedProviders: installed});
    const contentStore = useContentStore.getState();
    const activeInvalid =
      !contentStore.provider?.value ||
      (!adultAllowed && contentStore.provider.is_adult) ||
      (contentStore.provider?.value &&
        !installed.some(p => p.value === contentStore.provider.value));
    if (activeInvalid) {
      useContentStore.setState({
        provider:
          installed[0] || {
            value: '',
            display_name: '',
            type: 'global',
            installed: false,
            disabled: false,
            version: '0.0.1',
            icon: '',
            source: {author: '', url: ''},
            installedAt: 0,
            lastUpdated: 0,
          },
      });
    }

    onProgress({progress: 100, status: 'Ready!'});
    return { forceUpdate: false };
  } catch (err: any) {
    console.error('Init critical failure:', err);
    // Don't hang, proceed or show block
    return { forceUpdate: false };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}
