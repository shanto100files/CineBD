import {create} from 'zustand';
import axios from 'axios';
import {MMKV} from '../Mmkv';
import {useAuthStore} from './authStore';
import useContentStore from './contentStore';
import {extensionStorage, ProviderExtension} from '../storage/extensionStorage';
import {
  useProfileStore,
  isAdultAllowedForActiveProfile,
} from './profileStore';

const API = 'https://cinepix.top/api/app';
const CACHE_KEY = 'entitlements:providers';
const CACHE_TS_KEY = 'entitlements:ts';

/**
 * Provider entitlements for this device/account — the single source of
 * truth for which providers are visible anywhere in the app.
 *
 * - Logged out  -> null   (anonymous devices see `all`-mode providers only)
 * - Free user   -> admin-granted list, else the open catalog (`all`-mode)
 * - Premium     -> server list (grants + coupon unlocks + own selection)
 * - Admin       -> unrestricted (everything, including `selected`)
 *
 * The list is cached in MMKV so the first render after a cold start is
 * already filtered; it is re-validated against the server on launch and
 * whenever the auth token or a coupon redemption changes it.
 */
interface EntitlementState {
  /** null = anonymous/open catalog (`all`-mode only), [] = nothing allowed */
  allowed: string[] | null;
  isAdmin: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  clear: () => void;
  isAllowed: (value: string) => boolean;
  /** The full visibility filter (18+ gate + access mode + entitlements). */
  gatedInstalled: () => ProviderExtension[];
  /** Filter a candidate list (home fetch etc.) by the same entitlement rules. */
  applyTo: <T extends {value: string; access_mode?: string}>(candidates: T[]) => T[];
}

const readCache = (): string[] | null => {
  try {
    const raw = MMKV.getString(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Cached shape: {all:true} = open catalog (-> null), else explicit list.
    if (parsed && parsed.all === true) return null;
    return Array.isArray(parsed?.list) ? parsed.list : null;
  } catch {
    return null;
  }
};

/** Re-filter the visible installed-provider list after entitlements change. */
const reGateInstalledProviders = () => {
  try {
    // When the account just gained an 18+ entitlement (admin grant / coupon /
    // premium), auto-create a dedicated 18+ profile once so the user can
    // switch adult content into its own bucket instead of the default one.
    try {
      const {ensureAdultProfile} = require('./profileStore');
      ensureAdultProfile();
    } catch {}
    // Profile first: an explicit per-profile provider set (or family mode)
    // filters below the entitlement gate. Circular import is safe here
    // because both stores are only used inside function bodies.
    const {providersForActiveProfile} = require('./profileStore');
    const filtered = providersForActiveProfile(
      useEntitlementStore.getState().gatedInstalled(),
    );      useContentStore.setState({installedProviders: filtered});
    } catch {
      useContentStore.setState({
        installedProviders: useEntitlementStore.getState().gatedInstalled(),
      });
    }
};

/**
 * Public re-gate hook: called by ExtensionManager.initialize() after
 * auto-install finishes, so freshly installed (newly granted) providers
 * enter the visible list in the SAME app session instead of next launch.
 */
export const regateVisibleProviders = () => {
  reGateInstalledProviders();
};

export const useEntitlementStore = create<EntitlementState>((set, get) => ({
  allowed: readCache(),
  isAdmin: false,
  loaded: false,

  refresh: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      // Anonymous: allowed = null meaning "`all`-mode providers only".
      if (get().allowed !== null || get().loaded) {
        set({allowed: null, isAdmin: false, loaded: true});
        reGateInstalledProviders();
      }
      return;
    }
    try {
      const res = await axios.get(`${API}/myproviders`, {
        headers: {Authorization: `Bearer ${token}`},
        timeout: 10000,
      });
      const all = Boolean(res.data.all);
      const providers: string[] = (res.data.providers || [])
        .map((p: any) => p.value)
        .filter(Boolean);
      // Server answered with the open catalog (`all: true`) — everyone may
      // see those providers. Restricted accounts get an explicit list.
      set({allowed: all ? null : providers, isAdmin: false, loaded: true});
      reGateInstalledProviders();
      // If the allow-list changed, pull the personalized manifest + install
      // the newly granted selected providers right away (throttled 5 min).
      try {
        const prev = readCache();
        const changed = JSON.stringify(prev ? prev.slice().sort() : null) !== JSON.stringify(providers.slice().sort());
        if (changed) {
          require('../services/ExtensionManager').extensionManager
            .refreshAfterEntitlementChange()
            .catch(() => {});
        }
      } catch {}
      try {
        MMKV.setString(CACHE_KEY, JSON.stringify(all ? {all: true} : {list: providers}));
        MMKV.setString(CACHE_TS_KEY, String(Date.now()));
      } catch {}
    } catch {
      // Network error: keep whatever we had so the app stays usable.
      set({loaded: true});
    }
  },

  clear: () => {
    try {
      MMKV.removeItem(CACHE_KEY);
      MMKV.removeItem(CACHE_TS_KEY);
    } catch {}
    set({allowed: null, isAdmin: false, loaded: false});
    reGateInstalledProviders();
  },

  isAllowed: (value: string) => {
    const {allowed, isAdmin} = get();
    if (isAdmin) return true;
    if (allowed === null) return true;
    return allowed.includes(value);
  },

  gatedInstalled: () => {
    const installed = extensionStorage.getInstalledProviders() || [];
    // 18+ gate is PROFILE-AWARE: a family profile always blocks adult,
    // other profiles defer to the device age-gate setting.
    const adultOk = isAdultAllowedForActiveProfile();
    const {allowed, isAdmin} = get();
    const admin = isAdmin || !!useAuthStore.getState().user?.is_admin;
    // Per-profile provider set: null = aggregate, array = explicit values.
    let profileFiltered = installed;
    try {
      const profile = useProfileStore.getState().activeProfile();
      if (profile?.providers) {
        const wanted = new Set(profile.providers);
        profileFiltered = installed.filter(p => wanted.has(p.value));
      }
      if (profile?.kind === 'family') {
        profileFiltered = profileFiltered.filter(p => !p.is_adult);
      }
    } catch {}
    return profileFiltered.filter(p => {
      if (!adultOk && p.is_adult) return false;
      if (admin) return true;
      if (allowed === null) {
        // Anonymous or open-catalog account: only self-selectable providers.
        return p.access_mode !== 'selected';
      }
      // Explicit entitlement list = EXACTLY what admin granted (grants
      // REPLACE the open catalog, mirroring the server). 18+ gating above
      // handles the on/off toggle: off -> adult grants hidden.
      return allowed.includes(p.value);
    });
  },

  applyTo: candidates => {
    const {allowed, isAdmin} = get();
    const admin = isAdmin || !!useAuthStore.getState().user?.is_admin;
    // Per-profile provider set first (family mode hides 18+ even for admin).
    try {
      const profile = useProfileStore.getState().activeProfile();
      if (profile?.providers) {
        const wanted = new Set(profile.providers);
        candidates = candidates.filter(p => wanted.has(p.value));
      }
      if (profile?.kind === 'family') {
        candidates = candidates.filter(p => !(p as any).is_adult);
      }
    } catch {}
    if (admin) return candidates;
    // Profile-aware 18+ gate, mirroring gatedInstalled(). applyTo() is the
    // gate that decides which providers the home pipeline may FETCH, so it
    // must be able to drop adult entries too — the age gate used to be
    // enforced only on the *installed* list, and any caller passing its own
    // candidates bypassed it.
    try {
      if (!isAdultAllowedForActiveProfile()) {
        candidates = candidates.filter(p => !(p as any).is_adult);
      }
    } catch {}
    // NO "empty result -> hand back everything" fallback. Both branches below
    // used to invert into fail-OPEN: a restricted account whose allow-list
    // matched nothing installed (and an open-catalog account whose only
    // candidates were `selected`) silently received the whole catalog. The
    // candidates already come from gatedInstalled(), so a non-empty result is
    // the normal case; an empty one now means "nothing granted", correctly.
    if (allowed === null) {
      // Anonymous or open-catalog account: only self-selectable providers.
      return candidates.filter(p => p.access_mode !== 'selected');
    }
    return candidates.filter(p => allowed.includes(p.value));
  },
}));

// Auto-sync entitlements with the auth lifecycle: login -> refresh,
// logout -> clear. Runs once when this module is first imported.
let lastKnownToken: string | null | undefined;
useAuthStore.subscribe((state: any) => {
  const token: string | null = state.token ?? null;
  if (token === lastKnownToken) return;
  const hadToken = lastKnownToken !== undefined; // skip initial hydration
  lastKnownToken = token;
  if (!hadToken) return;
  if (token) {
    useEntitlementStore.getState().refresh();
  } else {
    useEntitlementStore.getState().clear();
  }
});
// Prime the tracker after hydration without triggering a fetch.
lastKnownToken = useAuthStore.getState().token ?? null;
