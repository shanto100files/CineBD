import {create} from 'zustand';
import {mainStorage} from '../storage/StorageService';
import {settingsStorage} from '../storage';
import {ProviderExtension} from '../storage/extensionStorage';
import {useAuthStore} from './authStore';

/**
 * Multi-profile system (YouTube "Who's watching?" style).
 *
 * Profiles are synced to the user's ACCOUNT (server, keyed by user id).
 * Locally they live in MMKV per bucket: `profiles:list:<uid>` for signed-in
 * users and the legacy `profiles:list` key as the guest bucket.
 * Each profile owns:
 *  - a provider set (or aggregate = everything the device/account may see)
 *  - its own watchlist + continue-watching history
 *  - a family-mode flag that force-hides 18+ content regardless of the
 *    device age-gate setting
 *  - an avatar (emoji or icon name) + color
 *
 * Visibility rules:
 *  - Guests CANNOT create/edit/switch profiles — the switcher shows a
 *    login CTA plus the admin presets (view-only). Login is required.
 *  - Free users see the admin's preset profiles and may use them as-is, but
 *    cannot customize the provider set (entitlement-gated).
 *  - Premium/admin users can freely create/edit profiles and pick any
 *    provider they are entitled to (single or multi/aggregate).
 */

const PROFILES_KEY = 'profiles:list';
const ACTIVE_KEY = 'profiles:activeId';
const SYNC_URL = 'https://cinepix.top/api/app/user-profiles';
const APP_KEY = '78a0e573dfd894d443685159b2e71e2f';

const currentBucket = (): string => {
  try {
    const {token, user} = useAuthStore.getState();
    if (!token) {
      return 'guest';
    }
    return user?.id ? String(user.id) : 'auth';
  } catch {
    return 'guest';
  }
};

const listKeyFor = (bucket: string) =>
  bucket === 'guest' ? PROFILES_KEY : `${PROFILES_KEY}:${bucket}`;
const activeKeyFor = (bucket: string) =>
  bucket === 'guest' ? ACTIVE_KEY : `${ACTIVE_KEY}:${bucket}`;

const load = (bucket: string): {profiles: UserProfile[]; activeId: string | null} => {
  try {
    const raw = mainStorage.getString(listKeyFor(bucket));
    const profiles: UserProfile[] = raw ? JSON.parse(raw) : [];
    const activeId = mainStorage.getString(activeKeyFor(bucket)) || null;
    return {profiles, activeId};
  } catch {
    return {profiles: [], activeId: null};
  }
};

const persist = (profiles: UserProfile[], activeId: string | null, bucket: string) => {
  try {
    mainStorage.setString(listKeyFor(bucket), JSON.stringify(profiles));
    if (activeId) {
      mainStorage.setString(activeKeyFor(bucket), activeId);
    } else {
      mainStorage.delete(activeKeyFor(bucket));
    }
  } catch {}
};

let activeBucket = currentBucket();
const {profiles: initialProfiles, activeId: initialActiveId} = load(activeBucket);

export interface UserProfile {
  id: string;
  name: string;
  /** 'me' = personal, 'family' = always hides 18+ */
  kind: 'me' | 'family';
  /** null = aggregate (everything entitled); else explicit provider values */
  providers: string[] | null;
  avatar: string;
  color: string;
  createdAt: number;
  /** preset templates are read-only for non-admins */
  isPreset?: boolean;
}

interface ProfileState {
  profiles: UserProfile[];
  activeId: string | null;
  /** Profiles from the server preset list (admin managed). */
  presets: UserProfile[];
  fetchPresets: () => Promise<void>;
  createProfile: (p: {
    name: string;
    kind?: 'me' | 'family';
    providers?: string[] | null;
    avatar?: string;
    color?: string;
  }) => UserProfile | null;
  updateProfile: (id: string, patch: Partial<UserProfile>) => void;
  deleteProfile: (id: string) => void;
  setActive: (id: string | null) => void;
  activeProfile: () => UserProfile | null;
  /** Providers visible for the ACTIVE profile (values only). null = aggregate. */
  activeProviders: () => string[] | null;
  /** Family profile forces the 18+ gate off regardless of device setting. */
  activeAdultBlocked: () => boolean;
  setPresets: (list: UserProfile[]) => void;
  /** Apply a preset as a new local profile (copy). */
  applyPreset: (presetId: string) => UserProfile | null;
  /** Fetch the account's profiles from the server and merge (login sync). */
  syncFromServer: () => Promise<void>;
  /** Push the current bucket's profiles to the server. */
  pushToServer: () => Promise<boolean>;
}

const AVATAR_COLORS = [
  '#EF5350', '#AB47BC', '#5C6BC0', '#29B6F6', '#26A69A',
  '#9CCC65', '#FFA726', '#FF7043', '#EC407A', '#7E57C2',
];

export const PROFILE_AVATARS = [
  'account', 'account-circle', 'face', 'face-man', 'face-woman',
  'baby-face-outline', 'emoticon-cool', 'emoticon-happy',
  'movie-open', 'television-classic', 'netflix', 'youtube-tv',
  'cat', 'dog', 'panda', 'ghost', 'robot', 'alien-outline',
];

const syncHeaders = () => {
  const token = useAuthStore.getState().token;
  return token ? {'X-App-Key': APP_KEY, Authorization: `Bearer ${token}`} : {'X-App-Key': APP_KEY};
};

const toServerShape = (p: UserProfile) => ({
  id: p.id,
  name: p.name,
  kind: p.kind,
  providers: p.providers,
  avatar: p.avatar,
  color: p.color,
  createdAt: p.createdAt,
});

const fromServerShape = (p: any): UserProfile => ({
  id: String(p.id ?? ''),
  name: String(p.name || 'প্রোফাইল').slice(0, 24),
  kind: p.kind === 'family' ? 'family' : 'me',
  providers: Array.isArray(p.providers) ? p.providers.map(String) : null,
  avatar: String(p.avatar || 'account'),
  color: String(p.color || '#5C6BC0'),
  createdAt: Number(p.createdAt) || 0,
});

const listSig = (list: UserProfile[]) =>
  list
    .map(
      p =>
        `${p.id}|${p.name}|${p.kind}|${p.providers === null ? '*' : p.providers.join(',')}|${p.avatar}|${p.color}|${p.createdAt}`,
    )
    .join('\n');

const clearGuestBucket = () => {
  try {
    mainStorage.delete(PROFILES_KEY);
    mainStorage.delete(ACTIVE_KEY);
  } catch {}
};

let pushTimer: ReturnType<typeof setTimeout> | null = null;
const queuePush = () => {
  if (!useAuthStore.getState().token) {
    return;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    pushTimer = null;
    useProfileStore.getState().pushToServer();
  }, 900);
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: initialProfiles,
  activeId: initialActiveId,
  presets: [],

  fetchPresets: async () => {
    try {
      const axios = require('axios').default || require('axios');
      const res = await axios.get('https://cinepix.top/api/app/profile-presets', {
        headers: {'X-App-Key': '78a0e573dfd894d443685159b2e71e2f'},
        timeout: 8000,
      });
      const list: UserProfile[] = (res.data?.presets || []).map((p: any, i: number) => ({
        id: String(p.id ?? i),
        name: String(p.name || 'Preset').slice(0, 24),
        kind: p.kind === 'family' ? 'family' : 'me',
        providers: Array.isArray(p.providers) ? p.providers.map(String) : null,
        avatar: String(p.avatar || 'shape'),
        color: String(p.color || '#5C6BC0'),
        createdAt: 0,
        isPreset: true,
      }));
      set({presets: list});
    } catch {}
  },

  createProfile: ({name, kind, providers, avatar, color}) => {
    const state = get();
    if (!useAuthStore.getState().isLoggedIn) {
      return null; // login required to create profiles
    }
    if (state.profiles.length >= 8) {
      return null; // cap at 8 profiles
    }
    const profile: UserProfile = {
      id: `pf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim().slice(0, 24),
      kind: kind || 'me',
      providers: providers ?? null,
      avatar: avatar || PROFILE_AVATARS[Math.floor(Math.random() * PROFILE_AVATARS.length)],
      color: color || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      createdAt: Date.now(),
    };
    const next = [...state.profiles, profile];
    persist(next, state.activeId, currentBucket());
    set({profiles: next});
    queuePush();
    return profile;
  },

  updateProfile: (id, patch) => {
    const state = get();
    const next = state.profiles.map(p => (p.id === id ? {...p, ...patch} : p));
    persist(next, state.activeId, currentBucket());
    set({profiles: next});
    queuePush();
  },

  deleteProfile: id => {
    const state = get();
    const wasActive = state.activeId === id;
    const next = state.profiles.filter(p => p.id !== id);
    const activeId = wasActive ? null : state.activeId;
    persist(next, activeId, currentBucket());
    set({profiles: next, activeId});
    queuePush();
    if (wasActive) {
      applyActiveProfile();
    }
  },

  setActive: id => {
    persist(get().profiles, id, currentBucket());
    set({activeId: id});
    applyActiveProfile();
  },

  activeProfile: () => {
    const {profiles, activeId} = get();
    return profiles.find(p => p.id === activeId) || null;
  },

  activeProviders: () => {
    const p = get().activeProfile();
    return p ? p.providers : null;
  },

  activeAdultBlocked: () => {
    const p = get().activeProfile();
    return p ? p.kind === 'family' : false;
  },

  setPresets: list => set({presets: list || []}),

  applyPreset: presetId => {
    const preset = get().presets.find(p => p.id === presetId);
    if (!preset) return null;
    return get().createProfile({
      name: preset.name,
      kind: preset.kind,
      providers: preset.providers,
      avatar: preset.avatar,
      color: preset.color,
    });
  },

  pushToServer: async () => {
    if (!useAuthStore.getState().token) {
      return false;
    }
    try {
      const axios = require('axios').default || require('axios');
      await axios.post(
        SYNC_URL,
        {profiles: get().profiles.map(toServerShape)},
        {headers: syncHeaders(), timeout: 10000},
      );
      return true;
    } catch {
      return false;
    }
  },

  syncFromServer: async () => {
    const {token} = useAuthStore.getState();
    const bucket = currentBucket();
    if (!token || bucket === 'guest') {
      return;
    }
    try {
      const axios = require('axios').default || require('axios');
      const res = await axios.get(SYNC_URL, {headers: syncHeaders(), timeout: 10000});
      const rawList: any[] = Array.isArray(res.data?.profiles) ? res.data.profiles : [];
      const remote: UserProfile[] = rawList.map(fromServerShape).filter(p => !!p.id);
      let local = get().profiles;
      let adopted = false;
      try {
        const raw = mainStorage.getString(PROFILES_KEY);
        const guestList: UserProfile[] = raw ? JSON.parse(raw) : [];
        if (Array.isArray(guestList) && guestList.length) {
          adopted = true;
          const ids = new Set(local.map(x => x.id));
          local = [...local, ...guestList.filter(x => x.id && !ids.has(x.id))];
        }
      } catch {}
      const remoteIds = new Set(remote.map(p => p.id));
      const merged = [...remote, ...local.filter(p => !remoteIds.has(p.id))];
      if (listSig(merged) !== listSig(get().profiles)) {
        persist(merged, get().activeId, bucket);
        set({profiles: merged});
      }
      const needPush = adopted || local.some(p => !remoteIds.has(p.id));
      if (needPush) {
        const ok = await get().pushToServer();
        if (ok && adopted) {
          clearGuestBucket();
        }
      }
    } catch {}
  },
}));

/**
 * Side effects after the active profile changes: reload the scoped
 * watchlist + continue-watching lists, re-gate the installed provider
 * list and fall back to the first allowed provider when the current one
 * is outside the new profile's set. Called by setActive().
 * Lazy requires keep the store graph free of circular imports.
 */
export const applyActiveProfile = () => {
  try {
    require('./watchListStore').reloadWatchListForProfile();
  } catch {}
  try {
    require('./continueWatchingStore').reloadHistoryForProfile();
  } catch {}
  try {
    const {useEntitlementStore} = require('./entitlementStore');
    const {default: useContentStore} = require('./contentStore');
    const gated = useEntitlementStore.getState().gatedInstalled();
    useContentStore.setState({installedProviders: gated});
    const current = useContentStore.getState().provider;
    if (current?.value && !gated.some((p: any) => p.value === current.value)) {
      useContentStore.setState({
        provider: gated[0] || {
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
  } catch {}
};

/**
 * Effective 18+ gate for the CURRENT profile + device setting.
 * Family profile => always false (blocked). No profile => device setting.
 * Drop-in replacement for settingsStorage.isAdultEnabled() in UI code.
 */
export const isAdultAllowedForActiveProfile = (): boolean => {  try {
    if (useProfileStore.getState().activeAdultBlocked()) {
      return false;
    }
  } catch {}
  return settingsStorage.isAdultEnabled();
};

/**
 * Can the current user customize profile provider sets?
 * Login is required at all (guests never reach profile editing); free
 * accounts cannot customize (they may only apply/use admin presets);
 * premium/admin can.
 */
export const canCustomizeProfiles = (): boolean => {
  const auth = useAuthStore.getState();
  if (!auth.isLoggedIn) return false;
  if (auth.user?.is_admin) return true;
  return auth.isPremium;
};

/**
 * Filter installed providers for the active profile:
 * 1. entitlement + device 18+ gate (existing rules)
 * 2. profile-specific set (explicit list or aggregate)
 * 3. family profile never shows 18+ providers
 */
export const providersForActiveProfile = (
  installed: ProviderExtension[],
): ProviderExtension[] => {
  const profile = useProfileStore.getState().activeProfile();
  let list = installed;
  if (profile?.providers) {
    const set = new Set(profile.providers);
    list = list.filter(p => set.has(p.value));
  }
  if (profile?.kind === 'family') {
    list = list.filter(p => !p.is_adult);
  }
  return list;
};

/**
 * The store itself (named export alias for convenience).
 */
export default useProfileStore;

/**
 * Switch profile buckets when auth changes: persist the outgoing bucket,
 * load the incoming one, re-gate providers and (on login) pull + merge the
 * account's profiles from the server.
 */
useAuthStore.subscribe(() => {
  const next = currentBucket();
  if (next === activeBucket) {
    return;
  }
  const prev = activeBucket;
  activeBucket = next;
  try {
    const store = useProfileStore.getState();
    persist(store.profiles, store.activeId, prev);
    const incoming = load(next);
    useProfileStore.setState({profiles: incoming.profiles, activeId: incoming.activeId});
    applyActiveProfile();
    if (next !== 'guest') {
      useProfileStore.getState().syncFromServer();
    }
  } catch {}
});
