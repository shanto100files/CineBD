import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import type {EpisodeLink} from '../providers/types';
import {createZustandStorage} from '../storage/StorageService';
import {useAuthStore} from './authStore';
import axios from 'axios';

const API = 'https://cinepix.top/api/app';

export interface ContinueWatchingItem {
  id: string;
  title: string;
  episodeTitle?: string;
  episode: EpisodeLink;
  type: string;
  poster?: string;
  background?: string;
  providerValue: string;
  infoUrl: string;
  position: number;
  duration: number;
  updatedAt: number;
}

interface ContinueWatchingState {
  items: ContinueWatchingItem[];
  upsertItem: (item: ContinueWatchingItem) => void;
  updateProgress: (id: string, position: number, duration: number) => void;
  removeItem: (id: string) => void;
  syncWithServer: () => Promise<void>;
}

async function serverSync(item: ContinueWatchingItem) {
  const token = useAuthStore.getState().token;
  if (!token) return;
  try {
    await axios.post(`${API}/history`, {
      provider: item.providerValue,
      link: item.infoUrl,
      title: item.title || '',
      image: item.poster || '',
      episode_link: item.episode?.link || '',
      episode_title: item.episodeTitle || '',
      season_num: item.episode?.season || 1,
      episode_num: item.episode?.episode || 1,
      progress_seconds: Math.floor(item.position),
      duration_seconds: Math.floor(item.duration),
    }, {
      headers: {Authorization: `Bearer ${token}`},
      timeout: 8000,
    });
  } catch {}
}

async function serverFetch(): Promise<ContinueWatchingItem[]> {
  const token = useAuthStore.getState().token;
  if (!token) return [];
  try {
    const res = await axios.get(`${API}/history`, {
      headers: {Authorization: `Bearer ${token}`},
      timeout: 8000,
    });
    return (res.data.items || []).map((r: any) => ({
      id: `${r.provider_value}:${r.post_link}:${r.season_num}:${r.episode_num}`,
      title: r.post_title || '',
      episodeTitle: r.episode_title || '',
      episode: {link: r.episode_link || '', episode: r.episode_num || 1, season: r.season_num || 1},
      type: 'series',
      poster: r.post_image || '',
      providerValue: r.provider_value,
      infoUrl: r.post_link,
      position: r.progress_seconds || 0,
      duration: r.duration_seconds || 0,
      updatedAt: new Date(r.updated_at).getTime() || Date.now(),
    }));
  } catch {
    return [];
  }
}

const useContinueWatchingStore = create<ContinueWatchingState>()(
  persist(
    set => ({
      items: [],
      upsertItem: item =>
        set(state => {
          const newItems = [
            item,
            ...state.items.filter(existing => existing.id !== item.id),
          ]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 30);
          serverSync(item);
          return {items: newItems};
        }),
      updateProgress: (id, position, duration) =>
        set(state => {
          const newItems = state.items
            .map(item =>
              item.id === id
                ? {...item, position, duration, updatedAt: Date.now()}
                : item,
            )
            .sort((a, b) => b.updatedAt - a.updatedAt);
          const updated = newItems.find(i => i.id === id);
          if (updated) serverSync(updated);
          return {items: newItems};
        }),
      removeItem: id =>
        set(state => ({items: state.items.filter(item => item.id !== id)})),

      syncWithServer: async () => {
        const token = useAuthStore.getState().token;
        if (!token) return;
        const serverItems = await serverFetch();
        if (serverItems.length === 0) return;
        set(state => {
          const localIds = new Set(state.items.map(i => i.id));
          const merged = [...state.items];
          for (const si of serverItems) {
            if (!localIds.has(si.id)) {
              merged.push(si);
            }
          }
          return {
            items: merged
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 30),
          };
        });
      },
    }),
    {
      name: 'continue-watching-storage',
      storage: createJSONStorage(() => createZustandStorage()),
    },
  ),
);

export default useContinueWatchingStore;
