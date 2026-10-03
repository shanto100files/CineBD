import {Platform} from 'react-native';
import * as Application from 'expo-application';
import {mainStorage as storage} from '../storage/StorageService';
import {settingsStorage} from '../storage/SettingsStorage';
import {useAuthStore} from '../zustand/authStore';
import {getDeviceId} from './heartbeatService';

const API = 'https://cinepix.top/api/app';
const BATCH_KEY = '@analytics_batch';
const BATCH_INTERVAL = 60 * 1000;
const MAX_BATCH_SIZE = 50;

let sessionId = '';
let lastSendTime = 0;
let deviceInfo: {model: string; brand: string; osVersion: string; appVersion: string} | null = null;

function getSessionId(): string {
  if (!sessionId) {
    sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
  }
  return sessionId;
}

function getDeviceInfo() {
  if (deviceInfo) return deviceInfo;
  const version = Application.nativeApplicationVersion ?? 'unknown';
  deviceInfo = {
    model: (Application as any).modelName ?? Platform.OS,
    brand: Platform.OS === 'android' ? 'Android' : 'iOS',
    osVersion: String(Platform.Version),
    appVersion: version,
  };
  return deviceInfo;
}

// The batch lives in memory. Every trackEvent used to JSON.parse + re-stringify
// the whole pending batch and write it back to MMKV — and trackEvent fires on
// EVERY navigation (App.tsx onStateChange), so switching tabs cost a full
// round trip of a list that grows to 50 events. It is now persisted only in
// flushes and once every 10 events (bounding what a hard kill can lose).
let pendingBatch: any[] | null = null;

function getPendingBatch(): any[] {
  const existing = pendingBatch;
  if (existing) {
    return existing;
  }
  // Local, not `pendingBatch` directly: because savePendingBatch assigns the
  // module-level variable from another closure, TS refuses to narrow it here.
  let batch: any[] = [];
  try {
    const raw = storage.getString(BATCH_KEY);
    batch = raw ? JSON.parse(raw) : [];
  } catch {
    batch = [];
  }
  pendingBatch = batch;
  return batch;
}

function savePendingBatch(events: any[]) {
  pendingBatch = events;
  storage.setString(BATCH_KEY, JSON.stringify(events));
}

function getGeoInfo(): {country: string; city: string} {
  return {country: '', city: ''};
}

export function trackEvent(eventType: string, data: Record<string, any> = {}) {
  if (!settingsStorage.isTelemetryOptIn()) {
    return;
  }
  const auth = useAuthStore.getState();
  const device = getDeviceInfo();
  const geo = getGeoInfo();

  const event = {
    event_type: eventType,
    username: auth.user?.username ?? '',
    page: data.page ?? '',
    screen: data.screen ?? '',
    provider: data.provider ?? '',
    content_title: data.content_title ?? '',
    content_link: data.content_link ?? '',
    device_model: device.model,
    device_brand: device.brand,
    os_version: device.osVersion,
    app_version: device.appVersion,
    country: geo.country,
    city: geo.city,
    session_id: getSessionId(),
    duration_seconds: data.duration_seconds ?? 0,
    extra_data: data.extra_data ?? null,
    timestamp: Date.now(),
  };

  const batch = getPendingBatch();
  batch.push(event);
  // Checkpoint every 10 events instead of writing on each one.
  if (batch.length % 10 === 0) {
    savePendingBatch(batch);
  }

  if (batch.length >= MAX_BATCH_SIZE) {
    flushBatch();
  }

  if (Date.now() - lastSendTime > BATCH_INTERVAL) {
    flushBatch();
  }
}

export function trackScreen(screen: string, provider?: string) {
  trackEvent('screen_view', {screen, provider: provider ?? ''});
}

export function trackContent(title: string, link: string, provider: string) {
  trackEvent('content_view', {content_title: title, content_link: link, provider});
}

export function trackAction(action: string, data: Record<string, any> = {}) {
  trackEvent(action, data);
}

export async function flushBatch() {
  if (!settingsStorage.isTelemetryOptIn()) {
    savePendingBatch([]);
    lastSendTime = 0;
    return;
  }
  const batch = getPendingBatch();
  if (batch.length === 0) return;

  lastSendTime = Date.now();
  savePendingBatch([]);

  try {
    const auth = useAuthStore.getState();
    const device = getDeviceInfo();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(`${API}/analytics-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-App-Version': device.appVersion,
          'X-App-Key': '78a0e573dfd894d443685159b2e71e2f',
        },
        body: JSON.stringify({
          events: batch,
          session_id: getSessionId(),
          username: auth.user?.username ?? '',
          device_model: device.model,
          device_brand: device.brand,
          os_version: device.osVersion,
          app_version: device.appVersion,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`analytics-batch failed with ${res.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    savePendingBatch([...batch, ...getPendingBatch()]);
  }
}

export function initAnalytics() {
  trackEvent('app_open');
}

export function resumeAnalytics() {
  trackEvent('app_resume');
}

export function pauseAnalytics() {
  trackEvent('app_pause');
  flushBatch();
}
