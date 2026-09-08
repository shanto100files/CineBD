import {extensionManager} from './ExtensionManager';
import {extensionStorage} from '../storage/extensionStorage';
import useContentStore from '../zustand/contentStore';
import {mainStorage as storage} from '../storage/StorageService';
import {Application} from 'expo-application';
import {getDeviceId} from './heartbeatService';
import axios from 'axios';

export interface InitProgress {
  progress: number;
  status: string;
}

const KILL_SWITCH_KEY = '@app_kill_key';
const HARDCODED_KILL_KEY = '78a0e573dfd894d443685159b2e71e2f';
const API_BASE = 'https://cinepix.top/api/app';

function compareVersions(local: string, min: string): boolean {
  const l = local.split('.').map(Number);
  const m = min.split('.').map(Number);
  if (l[0] > m[0]) return false;
  if (l[0] < m[0]) return true;
  if (l[1] > m[1]) return false;
  if (l[1] < m[1]) return true;
  return (l[2] || 0) < (m[2] || 0);
}

/**
 * Perform a quick version check only.
 * Used for foreground/app-return checks.
 */
export async function checkForceUpdateOnly(): Promise<boolean> {
  try {
    const vRes = await axios.get(`${API_BASE}/versioncheck`, { timeout: 5000 });
    const { min_version, force_update } = vRes.data;
    if (force_update) {
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
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_BASE}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': '78a0e573dfd894d443685159b2e71e2f'
      },
      body: JSON.stringify({key: storedKey, version, device_id: deviceId}),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return {blocked: data.blocked === true, shutdown: data.shutdown === true, reason: data.reason};
  } catch (e) {
    console.warn('Kill switch check failed, bypassing:', e);
    return {blocked: false, shutdown: false};
  }
}

export async function initializeApp(
  onProgress: (p: InitProgress) => void,
): Promise<{forceUpdate?: boolean}> {
  try {
    // Step 0: Check version & kill switch together
    onProgress({progress: 5, status: 'Checking updates...'});

    const forceUpdateNeeded = await checkForceUpdateOnly();
    if (forceUpdateNeeded) {
      return { forceUpdate: true };
    }

    // Check Kill Switch
    const check = await checkKillSwitch();
    if (check.shutdown) {
      const err = new Error('APP_SHUTDOWN');
      (err as any).reason = check.reason || 'App is under maintenance.';
      throw err;
    }
    if (check.blocked) {
      const err = new Error('KILL_SWITCH_BLOCKED');
      (err as any).reason = check.reason || 'App version is outdated.';
      throw err;
    }

    // Step 1: Initialize providers
    onProgress({progress: 20, status: 'Initializing engine...'});

    try {
      await withTimeout(extensionManager.fetchManifest(undefined, true), 4000);
    } catch {}

    onProgress({progress: 50, status: 'Loading providers...'});
    try {
      await withTimeout(extensionManager.initialize(), 4000);
    } catch {}

    const installed = extensionStorage.getInstalledProviders();
    const contentStore = useContentStore.getState();
    if (installed.length > 0) {
      useContentStore.setState({installedProviders: installed});
      if (!contentStore.provider?.value) {
        useContentStore.setState({provider: installed[0]});
      }
    }

    onProgress({progress: 100, status: 'Ready!'});
    return { forceUpdate: false };
  } catch (err: any) {
    if (err?.message === 'APP_SHUTDOWN' || err?.message === 'KILL_SWITCH_BLOCKED') {
      throw err;
    }
    console.error('Initialization error:', err);
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
