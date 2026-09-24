// JS bridge for the ReadMediaVideo native module (one-tap Android 13+
// "Allow limited / Allow all" dialog + MediaStore video listing).
import {NativeModules, Platform} from 'react-native';

export interface DeviceVideo {
  uri: string;
  name: string;
  durationMs: number;
  sizeBytes: number;
  folder: string;
}

type ReadMediaVideoModuleType = {
  check?: () => Promise<boolean>;
  request?: () => Promise<boolean>;
  listVideos?: () => Promise<DeviceVideo[]>;
};

const module: ReadMediaVideoModuleType | undefined =
  NativeModules.ReadMediaVideoModule as ReadMediaVideoModuleType | undefined;

export const hasVideoPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    return (await module?.check?.()) === true;
  } catch {
    return false;
  }
};

/** Fires the system one-tap dialog (MovieBox-style). Resolves immediately. */
export const requestVideoPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    await module?.request?.();
    return true;
  } catch {
    return false;
  }
};

export const listDeviceVideos = async (): Promise<DeviceVideo[]> => {
  if (Platform.OS !== 'android') {
    return [];
  }
  try {
    return (await module?.listVideos?.()) || [];
  } catch {
    return [];
  }
};
