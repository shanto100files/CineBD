import {useState, useEffect, useCallback, useMemo} from 'react';
import axios from 'axios';
import {useProfileStore} from '../zustand/profileStore';
import {settingsStorage} from '../storage';
import {profileCanShowAdult} from '../adultLock';

const API_BASE = 'https://cinepix.top/api/app';

export interface AppAds {
  enabled: boolean;
  web_url: string;
  top: string;
  bottom: string;
  /** Direct-link creative shown ONLY while an adult-capable profile is active. */
  adult_url: string;
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
    adult_url: typeof source.adult_url === 'string' ? source.adult_url : '',
  };
};

/**
 * Adult-profile ad slot: returns the server-configured direct link while an
 * adult-capable profile is active (default profile with the 18+ toggle on,
 * or an explicit 18+ provider set). Family profiles get '' (no ad).
 */
export function useAdultAds() {
  const ads = useAppAds();
  const activeProfile = useProfileStore(state => state.activeProfile);
  const activeProfileId = useProfileStore(state => state.activeId);
  const adultEnabled = settingsStorage.isAdultEnabled();

  return useMemo(() => {
    let adultProfile = false;
    try {
      // Reuse the lock layer's own predicate. This used to re-implement "is
      // this profile adult" as `providers.length > 0`, so ANY curated
      // (non-family) profile counted as adult and got the direct-link adult
      // creative — exactly the heuristic adultLock.ts documents as wrong.
      // profileCanShowAdult instead checks whether the set really lists an
      // `is_adult` provider, and falls back to the device toggle.
      adultProfile = profileCanShowAdult(activeProfile(), adultEnabled);
    } catch {
      adultProfile = adultEnabled;
    }
    if (!adultProfile || !ads.enabled) return '';
    return ads.adult_url || '';
  }, [ads.enabled, ads.adult_url, activeProfile, activeProfileId, adultEnabled]);
}

export function useAppAds() {
  const [ads, setAds] = useState<AppAds>(cachedAds || {
    enabled: false,
    web_url: '',
    top: '',
    bottom: '',
    adult_url: '',
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
