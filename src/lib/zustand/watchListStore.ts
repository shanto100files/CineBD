import {create} from 'zustand';
import {watchListStorage, WatchListItem} from '../storage';
import {useAuthStore} from './authStore';
import axios from 'axios';

const API = 'https://cinepix.top/api/app';

export type WatchList = WatchListItem;

interface WatchListStore {
  watchList: WatchList[];
  removeItem: (link: string) => void;
  addItem: (item: WatchList) => void;
  syncWithServer: () => Promise<void>;
}

async function serverToggle(item: WatchList): Promise<boolean | null> {
  const token = useAuthStore.getState().token;
  if (!token) return null;
  try {
    const res = await axios.post(`${API}/watchlist`, {
      provider: item.provider,
      link: item.link,
      title: item.title || '',
      image: item.poster || '',
    }, {
      headers: {Authorization: `Bearer ${token}`},
      timeout: 8000,
    });
    return res.data.watchlisted ?? null;
  } catch {
    return null;
  }
}

async function serverFetch(): Promise<WatchList[]> {
  const token = useAuthStore.getState().token;
  if (!token) return [];
  try {
    const res = await axios.get(`${API}/watchlist`, {
      headers: {Authorization: `Bearer ${token}`},
      timeout: 8000,
    });
    return (res.data.items || []).map((r: any) => ({
      link: r.post_link,
      provider: r.provider_value,
      title: r.post_title || '',
      poster: r.post_image || '',
    }));
  } catch {
    return [];
  }
}

/** Active profile id ("" = no profile). Lazy require avoids circular imports. */
export const activeWatchScope = (): string => {
  try {
    const {default: useProfileStore} = require('./profileStore');
    return useProfileStore.getState().activeId || '';
  } catch {
    return '';
  }
};

const scoped = (): WatchList[] => watchListStorage.getWatchList(activeWatchScope());

const useWatchListStore = create<WatchListStore>()(set => ({
  watchList: scoped(),

  removeItem: link => {
    const removedItem = scoped().find(i => i.link === link);
    const newWatchList = watchListStorage.removeFromWatchList(link, activeWatchScope());
    set({watchList: newWatchList});
    if (removedItem) {
      serverToggle(removedItem);
    }
  },

  addItem: item => {
    const newWatchList = watchListStorage.addToWatchList(item, activeWatchScope());
    set({watchList: newWatchList});
    serverToggle(item);
  },

  syncWithServer: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const serverItems = await serverFetch();
    if (serverItems.length === 0) return;
    const localItems = scoped();
    const localLinks = new Set(localItems.map(i => i.link));
    let changed = false;
    for (const si of serverItems) {
      if (!localLinks.has(si.link)) {
        watchListStorage.addToWatchList(si, activeWatchScope());
        changed = true;
      }
    }
    if (changed) {
      set({watchList: watchListStorage.getWatchList(activeWatchScope())});
    }
  },
}));

/**
 * Reload the list from the scoped storage after a profile switch.
 * Called by the profile switcher when the active profile changes.
 */
export const reloadWatchListForProfile = () => {
  useWatchListStore.setState({watchList: scoped()});
};

export default useWatchListStore;
