import {Platform} from 'react-native';
import * as Application from 'expo-application';
import {getDeviceId} from './heartbeatService';

const ENDPOINT = 'https://cinepix.top/api/app/error-report';
const APP_KEY = '78a0e573dfd894d443685159b2e71e2f';

export interface AppErrorPayload {
  tag: string;
  message: string;
  fatal?: boolean;
  stack?: string;
  extra?: Record<string, unknown>;
}

let authUserId: number | null = null;
/** Called from App.tsx on auth changes so reports carry the user id. */
export const setErrorReporterUser = (id: number | null) => {
  authUserId = id;
};

let lastSent: {msg: string; at: number} | null = null;

/**
 * Fire-and-forget error report. Deduplicates identical messages within
 * 60s, never throws, never blocks the caller.
 */
export const reportAppError = (payload: AppErrorPayload) => {
  try {
    const now = Date.now();
    if (lastSent && lastSent.msg === payload.message && now - lastSent.at < 60000) {
      return;
    }
    lastSent = {msg: payload.message, at: now};

    const body = JSON.stringify({
      tag: String(payload.tag || 'app').slice(0, 40),
      message: String(payload.message || 'unknown').slice(0, 2000),
      fatal: payload.fatal === true,
      stack: payload.stack ? String(payload.stack).slice(0, 8000) : undefined,
      extra: payload.extra,
      app_version: Application.nativeApplicationVersion || undefined,
      platform: Platform.OS,
      user_id: authUserId,
    });

    fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'X-App-Key': APP_KEY, 'X-Device-Id': getDeviceId()},
      body,
    }).catch(() => {});
  } catch {}
};
