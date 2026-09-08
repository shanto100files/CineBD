import {extensionManager} from './ExtensionManager';
import {extensionStorage} from '../storage/extensionStorage';
import useContentStore from '../zustand/contentStore';
import {mainStorage as storage} from '../storage/StorageService';
import * as Application from 'expo-application';
import {getDeviceId} from './heartbeatService';
import axios from 'axios';

export interface InitProgress {
  progress: number;
  status: string;
}

const KILL_SWITCH_KEY = '@app_kill_key';
const HARDCODED_KILL_KEY = 'ad21dada6e67564a2f08e6c282c66699';
const API_BASE = 'https://cinepix.top/api/app';

function compareVersions(local: string, min: string): boolean {
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
    const vRes = await axios.get(`${API_BASE}/versioncheck`, { timeout: 4000 });
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
    const timeout = setTimeout(() => controller.abort(), 4000); // Low timeout for quick fail

    const res = await fetch(`${API_BASE}/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': HARDCODED_KILL_KEY
      },
      body: JSON.stringify({key: storedKey, version, device_id: deviceId}),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return {blocked: true, reason: 'Access Denied (Security Server Error)'};
    }

    const data = await res.json();
    return {blocked: data.blocked === true, shutdown: data.shutdown === true, reason: data.reason};
  } catch (e) {
    console.warn('Kill switch check error:', e);
    // If you want it to ALWAYS block when server is unreachable, change this to blocked: true
    return {blocked: false, shutdown: false};
  }
}

export async function initializeApp(
  onProgress: (p: InitProgress) => void,
): Promise<{forceUpdate?: boolean; blocked?: boolean; reason?: string}> {
  try {
    onProgress({progress: 5, status: 'Verifying session...'});

    // 1. Kill Switch Check
    const check = await checkKillSwitch();
    if (check.shutdown || check.blocked) {
      return { blocked: true, reason: check.reason };
    }

    // 2. Force Update Check
    onProgress({progress: 15, status: 'Checking for updates...'});
    const forceUpdateNeeded = await checkForceUpdateOnly();
    if (forceUpdateNeeded) {
      return { forceUpdate: true };
    }

    // Normal Initialization
    onProgress({progress: 30, status: 'Initializing engine...'});
    try {
      await withTimeout(extensionManager.fetchManifest(undefined, true), 4000);
    } catch {}

    onProgress({progress: 60, status: 'Loading providers...'});
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
