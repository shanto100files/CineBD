import {useEntitlementStore} from '../zustand/entitlementStore';

/**
 * Central provider visibility gate — delegates to the entitlement store,
 * which combines the 18+ age gate, access mode and the account's
 * allow-list in one filter. Kept as a separate module so existing
 * call-sites don't change.
 */
export const getGatedInstalledProviders = () =>
  useEntitlementStore.getState().gatedInstalled();
