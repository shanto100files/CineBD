import {create} from 'zustand';
import {mainStorage} from '../storage/StorageService';
import {settingsStorage} from '../storage';
import {ProviderExtension} from '../storage/extensionStorage';
import {useAuthStore} from './authStore';

/**
 * Multi-profile system (YouTube "Who's watching?" style).
 *
 * Profiles are device-local (MMKV). Each profile owns:
 *  - a provider set (or aggregate = everything the device/account may see)
 *  - its own watchlist + continue-watching history
 *  - a family-mode flag that force-hides 18+ content regardless of the
 *    device age-gate setting
 *  - an avatar (emoji or icon name) + color
 *
 * Visibility rules:
 *  - Guests (non-signed-in users) can SEE profiles and switch them, but can
 *    only pick providers inside `all`-mode (what the device may see anyway).
 *  - Free users see the admin's preset profiles and may use them as-is, but
 *    cannot customize the provider set (entitlement-gated).
 *  - Premium/admin users can freely create/edit profiles and pick any
 *    provider they are entitled to (single or multi/aggregate).
 */

const PROFILES_KEY = 'profiles:list';
const ACTIVE_KEY = 'profiles:activeId';

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

const load = (): {profiles: UserProfile[]; activeId: string | null} => {
  try {
    const raw = mainStorage.getString(PROFILES_KEY);
    const profiles: UserProfile[] = raw ? JSON.parse(raw) : [];
    const activeId = mainStorage.getString(ACTIVE_KEY) || null;
    return {profiles, activeId};
  } catch {
    return {profiles: [], activeId: null};
  }
};

const persist = (profiles: UserProfile[], activeId: string | null) => {
  try {
    mainStorage.setString(PROFILES_KEY, JSON.stringify(profiles));
    if (activeId) {
      mainStorage.setString(ACTIVE_KEY, activeId);
    } else {
      mainStorage.delete(ACTIVE_KEY);
    }
  } catch {}
};

const {profiles: initialProfiles, activeId: initialActiveId} = load();

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
    persist(next, state.activeId);
    set({profiles: next});
    return profile;
  },

  updateProfile: (id, patch) => {
    const state = get();
    const next = state.profiles.map(p => (p.id === id ? {...p, ...patch} : p));
    persist(next, state.activeId);
    set({profiles: next});
  },

  deleteProfile: id => {
    const state = get();
    const wasActive = state.activeId === id;
    const next = state.profiles.filter(p => p.id !== id);
    const activeId = wasActive ? null : state.activeId;
    persist(next, activeId);
    set({profiles: next, activeId});
    if (wasActive) {
      applyActiveProfile();
    }
  },

  setActive: id => {
    persist(get().profiles, id);
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
 * Guests can pick from the open catalog (`all`-mode); free accounts cannot
 * customize (they may only apply/use admin presets); premium/admin can.
 */
export const canCustomizeProfiles = (): boolean => {
  const user = useAuthStore.getState().user;
  if (user?.is_admin) return true;
  if (useAuthStore.getState().isPremium) return true;
  // Guests may re-order the OPEN catalog per profile, but never see `selected`.
  return !useAuthStore.getState().isLoggedIn;
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
