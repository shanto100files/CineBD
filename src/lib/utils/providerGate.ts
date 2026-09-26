import {settingsStorage} from '../storage';
import {extensionStorage, ProviderExtension} from '../storage/extensionStorage';

export const getGatedInstalledProviders = (): ProviderExtension[] => {
  const installed = extensionStorage.getInstalledProviders() || [];
  if (settingsStorage.isAdultEnabled()) {
    return installed;
  }
  return installed.filter(p => !p.is_adult);
};
