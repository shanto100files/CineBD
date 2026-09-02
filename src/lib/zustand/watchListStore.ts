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

const useWatchListStore = create<WatchListStore>()(set => ({
  watchList: watchListStorage.getWatchList(),

  removeItem: link => {
    const newWatchList = watchListStorage.removeFromWatchList(link);
    set({watchList: newWatchList});
    const item = newWatchList.find(i => i.link === link);
    if (!item) {
      const token = useAuthStore.getState().token;
      if (token) {
        const allItems = watchListStorage.getWatchList();
        const removedItem = allItems.find(i => i.link === link);
        if (removedItem) serverToggle(removedItem);
      }
    }
  },

  addItem: item => {
    const newWatchList = watchListStorage.addToWatchList(item);
    set({watchList: newWatchList});
    serverToggle(item);
  },

  syncWithServer: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const serverItems = await serverFetch();
    if (serverItems.length === 0) return;
    const localItems = watchListStorage.getWatchList();
    const localLinks = new Set(localItems.map(i => i.link));
    let changed = false;
    for (const si of serverItems) {
      if (!localLinks.has(si.link)) {
        watchListStorage.addToWatchList(si);
        changed = true;
      }
    }
    if (changed) {
      set({watchList: watchListStorage.getWatchList()});
    }
  },
}));

export default useWatchListStore;
