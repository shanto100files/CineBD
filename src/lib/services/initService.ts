import {extensionManager} from './ExtensionManager';
import useContentStore from '../zustand/contentStore';
import {useAuthStore} from '../zustand/authStore';
import {mainStorage as storage} from '../storage/StorageService';
import {settingsStorage} from '../storage';
import * as Application from 'expo-application';
import {getDeviceId} from './heartbeatService';
import {getGatedInstalledProviders} from '../utils/providerGate';
import axios from 'axios';
import {Platform} from 'react-native';

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
      // TV devices identify themselves and (when logged in) receive the
      // account-level tv_adult_enabled flag so a phone can remotely turn 18+
      // off on the TV.
      const isTvDevice = Platform.isTV;
      const tvToken = isTvDevice ? useAuthStore.getState().token : null;
      const res = await fetch(`${API_BASE}/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Key': HARDCODED_KILL_KEY,
          ...(tvToken ? {Authorization: `Bearer ${tvToken}`} : {}),
        },
        body: JSON.stringify({key: storedKey, version, device_id: deviceId, device_type: isTvDevice ? 'tv' : 'mobile'}),
        signal: controller.signal,
      });

      if (!res.ok) {
        return {blocked: true, reason: 'Access Denied (Security Server Error)'};
      }

      const data = await res.json();
      // Android TV + logged in + account says 18+ off → force it off locally,
      // overriding whatever the TV's local toggle says. This is the remote
      // parental control: the phone decides for the TV.
      if (isTvDevice && data.tv_adult_enabled === false) {
        settingsStorage.setAdultEnabled(false);
      }
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
  // Splash progress must never jump backwards. With the engine warm-up now
  // overlapping the security checks, either side can reach a milestone first.
  let furthestProgress = 0;
  const report = (p: InitProgress) => {
    if (p.progress < furthestProgress) {
      return;
    }
    furthestProgress = p.progress;
    onProgress(p);
  };

  try {
    report({progress: 5, status: 'Verifying session...'});
    report({progress: 15, status: 'Checking for updates...'});

    // Warm the provider engine CONCURRENTLY with the kill-switch/force-update
    // checks. They used to run strictly in series, so every cold start paid
    // for two network round-trips AND the manifest + auto-install one after
    // another — all of it landing on the splash screen.
    const engine = (async () => {
      report({progress: 30, status: 'Initializing engine...'});
      // Cache-aware, NOT forced. The old `fetchManifest(undefined, true)`
      // re-downloaded the whole manifest on EVERY launch, ignoring the 24h
      // cache this very function then re-checks in initialize(). A warm cache
      // now answers without touching the network; expiry and auth changes are
      // still honoured by initialize().
      try {
        await withTimeout(extensionManager.fetchManifest(), 10000);
      } catch {}
      report({progress: 60, status: 'Loading providers...'});
      try {
        await withTimeout(extensionManager.initialize(), 10000);
      } catch {}
    })().catch(() => {});

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
    await engine;
    report({progress: 85, status: 'Loading providers...'});

    // 18+ gating: hide adult providers unless the age gate was passed.
    // PROFILE-AWARE: a family profile always blocks adult content.
    let adultAllowed = settingsStorage.isAdultEnabled();
    try {
      const {isAdultAllowedForActiveProfile} = require('../zustand/profileStore');
      adultAllowed = isAdultAllowedForActiveProfile();
    } catch {}
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

    report({progress: 100, status: 'Ready!'});
    return { forceUpdate: false };
  } catch (err: any) {
    console.error('Init critical failure:', err);
    // Don't hang, proceed or show block
    return { forceUpdate: false };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  // Clear the timer when whichever side wins settles: racing an un-cleared
  // timeout leaves a pending 10s timer (and a later rejection nobody needs)
  // behind on every single cold start.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}
