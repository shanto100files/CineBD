import {useState, useEffect, useCallback} from 'react';
import axios from 'axios';

const API_BASE = 'https://cinepix.top/api/app';

export interface AppAds {
  enabled: boolean;
  web_url: string;
  top: string;
  bottom: string;
}

let cachedAds: AppAds | null = null;
let lastFetch = 0;
const CACHE_TTL = 5 * 60 * 1000;

export const normalizeAppAds = (data: unknown): AppAds => {
  const source = (data && typeof data === 'object' ? data : {}) as Partial<
    AppAds
  >;
  return {
    enabled: Boolean(source.enabled),
    web_url: typeof source.web_url === 'string' ? source.web_url : '',
    top: typeof source.top === 'string' ? source.top : '',
    bottom: typeof source.bottom === 'string' ? source.bottom : '',
  };
};

export function useAppAds() {
  const [ads, setAds] = useState<AppAds>(cachedAds || {
    enabled: false,
    web_url: '',
    top: '',
    bottom: '',
  });

  const fetchAds = useCallback(async () => {
    if (cachedAds && Date.now() - lastFetch < CACHE_TTL) {
      setAds(cachedAds);
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/ads`, {timeout: 10000});
      const data = normalizeAppAds(res.data);
      cachedAds = data;
      lastFetch = Date.now();
      setAds(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  return ads;
}
