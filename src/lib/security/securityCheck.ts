import {Platform, NativeModules} from 'react-native';
import * as Application from 'expo-application';

let RootedState = false;
let TamperedState = false;

const EXPECTED_SIGNATURE = '308203b53082029da0030201020204';
const EXPECTED_PACKAGE = 'com.vega';

const isDevelopmentBuild = (): boolean => {
  return __DEV__ || (Application.applicationId || '').includes('.debug');
};

const checkRootDetection = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return false;
  try {
    const {default: RNFS} = await import('@dr.pogodin/react-native-fs');
    const paths = [
      '/system/app/Superuser.apk',
      '/system/xbin/su',
      '/system/bin/su',
      '/sbin/su',
      '/data/local/xbin/su',
      '/data/local/bin/su',
      '/system/sd/xbin/su',
      '/system/bin/failsafe/su',
      '/data/local/su',
      '/system/app/SuperSU.apk',
      '/system/xbin/daemonsu',
      '/data/adb/magisk',
      '/sbin/magisk',
      '/system/bin/magisk',
      '/system/xbin/magisk',
    ];
    for (const p of paths) {
      const exists = await RNFS.exists(p);
      if (exists) return true;
    }

    const {default: RNFS2} = await import('@dr.pogodin/react-native-fs');
    const buildProps = await RNFS2.readFile('/system/build.prop', 'utf8').catch(() => '');
    if (buildProps.includes('ro.debuggable=1') || buildProps.includes('ro.secure=0')) {
      return true;
    }
  } catch {}
  return false;
};

const checkEmulator = (): boolean => {
  return (
    Platform.OS === 'android' &&
    (NativeModules?.RNDeviceInfo?.isEmulator === true ||
      (NativeModules?.DeviceInfo?.isEmulator === true))
  );
};

const checkPackageTamper = (): boolean => {
  const pkg = Application.applicationId || '';
  return pkg !== EXPECTED_PACKAGE;
};

const checkDebuggerAttached = (): boolean => {
  if (Platform.OS !== 'android') return false;
  try {
    const {default: RNFS} = require('@dr.pogodin/react-native-fs');
    const statusPath = '/proc/self/status';
    const status = RNFS.readFileSync?.(statusPath) || '';
    if (typeof status === 'string' && status.includes('TracerPid:')) {
      const match = status.match(/TracerPid:\s*(\d+)/);
      if (match && match[1] !== '0') return true;
    }
  } catch {}
  return false;
};

export const runSecurityCheck = async (): Promise<{
  isRooted: boolean;
  isEmulator: boolean;
  isDev: boolean;
  isTampered: boolean;
  passed: boolean;
}> => {
  const isRooted = await checkRootDetection();
  const isEmulator = checkEmulator();
  const isDev = isDevelopmentBuild();
  const isTampered = checkPackageTamper();
  RootedState = isRooted;
  TamperedState = isTampered;

  return {
    isRooted,
    isEmulator,
    isDev,
    isTampered,
    passed: !isRooted && !isTampered,
  };
};

export const isDeviceRooted = () => RootedState;
export const isAppTampered = () => TamperedState;
