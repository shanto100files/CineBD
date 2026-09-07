import {extensionManager} from './ExtensionManager';
import {extensionStorage} from '../storage/extensionStorage';
import useContentStore from '../zustand/contentStore';
import {mainStorage as storage} from '../storage/StorageService';
import {Application} from 'expo-application';
import {Platform} from 'react-native';
import {getDeviceId} from './heartbeatService';

export interface InitProgress {
  progress: number;
  status: string;
}

const KILL_SWITCH_KEY = '@app_kill_key';
const HARDCODED_KILL_KEY = 'ad21dada6e67564a2f08e6c282c66699';

async function checkKillSwitch(): Promise<{blocked: boolean; shutdown?: boolean; reason?: string; failed?: boolean}> {
  try {
    const storedKey = storage.getString(KILL_SWITCH_KEY) || HARDCODED_KILL_KEY;
    const version = Application.nativeApplicationVersion ?? '0.0.0';
    const deviceId = getDeviceId();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://cinepix.top/api/app/check', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({key: storedKey, version, device_id: deviceId}),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    return {blocked: data.blocked === true, shutdown: data.shutdown === true, reason: data.reason};
  } catch {
    return {blocked: true, reason: 'Unable to connect to server. Please check your internet connection.'};
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

export async function initializeApp(
  onProgress: (p: InitProgress) => void,
): Promise<void> {
  // Step 0: Check kill switch
  onProgress({progress: 2, status: 'Checking updates...'});
  const check = await checkKillSwitch();
  if (check.shutdown) {
    const err = new Error('APP_SHUTDOWN');
    (err as any).reason = check.reason || 'App is under maintenance. Please try again later.';
    throw err;
  }
  if (check.blocked) {
    const err = new Error('KILL_SWITCH_BLOCKED');
    (err as any).reason = check.reason || 'App version is outdated. Please update.';
    throw err;
  }
  // Step 1: Migrate legacy source
  onProgress({progress: 5, status: 'Initializing...'});
  await new Promise(r => setTimeout(r, 200));

  // Step 2: Fetch manifest
  onProgress({progress: 15, status: 'Fetching providers...'});
  try {
    await withTimeout(extensionManager.fetchManifest(undefined, true), 8000);
  } catch {
    try {
      await withTimeout(extensionManager.fetchManifest(undefined, false), 8000);
    } catch {}
  }
  onProgress({progress: 35, status: 'Providers found'});
  await new Promise(r => setTimeout(r, 150));

  // Step 3: Initialize extension manager (loads installed providers)
  onProgress({progress: 40, status: 'Loading installed providers...'});
  try {
    await withTimeout(extensionManager.initialize(), 5000);
  } catch {}
  await new Promise(r => setTimeout(r, 150));

  // Step 4: Get installed providers and check if we need to install more
  const source = extensionStorage.getProviderSource();
  if (source) {
    const installed = extensionStorage.getInstalledProviders();
    const available = extensionStorage.getAvailableProviders(source.author);

    onProgress({
      progress: 50,
      status: `${installed.length} providers installed`,
    });

    // Step 5: Install any missing providers
    const notInstalled = available.filter(
      p => !installed.some(i => i.value === p.value),
    );

    if (notInstalled.length > 0) {
      onProgress({
        progress: 55,
        status: `Installing ${notInstalled.length} providers...`,
      });

      for (let i = 0; i < notInstalled.length; i++) {
        const prov = notInstalled[i];
        const percent = 55 + Math.round((i / notInstalled.length) * 30);
        onProgress({
          progress: percent,
          status: `Installing ${prov.display_name}...`,
        });
        try {
          await extensionManager.installProvider(prov);
        } catch (err) {
          console.warn(`Failed to install ${prov.value}:`, err);
        }
      }
    }

    // Step 6: Auto-select providers for home (if none selected)
    onProgress({progress: 85, status: 'Setting up home...'});
    const contentStore = useContentStore.getState();
    const installedAfter = extensionStorage.getInstalledProviders();

    if (installedAfter.length > 0) {
      // Update installed providers in store
      useContentStore.setState({installedProviders: installedAfter});

      // If no provider is selected, select the first one
      if (!contentStore.provider?.value && installedAfter.length > 0) {
        useContentStore.setState({provider: installedAfter[0]});
      }
    }
  }

  // Step 7: Final
  onProgress({progress: 95, status: 'Almost ready...'});
  await new Promise(r => setTimeout(r, 200));

  onProgress({progress: 100, status: 'Ready!'});
  await new Promise(r => setTimeout(r, 150));
}
