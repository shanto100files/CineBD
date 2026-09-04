import {Platform, NativeModules} from 'react-native';
import * as Application from 'expo-application';

let RootedState = false;

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
    ];
    for (const p of paths) {
      const exists = await RNFS.exists(p);
      if (exists) return true;
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

export const runSecurityCheck = async (): Promise<{
  isRooted: boolean;
  isEmulator: boolean;
  isDev: boolean;
  passed: boolean;
}> => {
  const isRooted = await checkRootDetection();
  const isEmulator = checkEmulator();
  const isDev = isDevelopmentBuild();
  RootedState = isRooted;

  return {
    isRooted,
    isEmulator,
    isDev,
    passed: !isRooted,
  };
};

export const isDeviceRooted = () => RootedState;
