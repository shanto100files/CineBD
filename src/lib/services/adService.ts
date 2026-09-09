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
      const data = res.data;
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
