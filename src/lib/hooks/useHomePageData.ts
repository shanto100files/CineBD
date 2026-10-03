import React, {useEffect, useRef} from 'react';
import {InteractionManager} from 'react-native';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {getHomePageData, HomePageData} from '../getHomepagedata';
import {Content} from '../zustand/contentStore';
import {cacheStorage} from '../storage';
import useContentStore from '../zustand/contentStore';
import axios from 'axios';
import {useAuthStore} from '../zustand/authStore';
import {useEntitlementStore} from '../zustand/entitlementStore';
import {useProfileStore} from '../zustand/profileStore';

async function syncToServer(providerValue: string, sections: HomePageData[]) {
  try {
    await axios.post('https://cinepix.top/api/app/sync', {
      provider: providerValue,
      sections: sections.map(s => ({
        title: s.title,
        filter: s.filter,
        Posts: (s.Posts || []).map(p => ({
          title: p.title,
          link: p.link,
          image: p.image,
        })),
      })),
    }, {timeout: 10000});
  } catch {}
}

/**
 * The home rows are cached PER identity (profile | providers | token) instead
 * of in one shared slot.
 *
 * The single slot meant a profile switch produced a brand-new query key with
 * nothing to seed it, so every profile change fell back to the bare skeleton
 * and re-fetched all 16 rows from scratch. Keying by the signature lets a
 * profile paint its own rows immediately and refresh behind them.
 */
const HOME_CACHE_PREFIX = 'homeDataAggregate::';
/** LRU list of the signatures currently held, newest first. */
const HOME_CACHE_INDEX = 'homeDataAggregate:sigs';
/** The pre-per-signature slot, still read once so the first run after this
 *  change does not throw away a warm cache. */
const HOME_CACHE_LEGACY = 'homeDataAggregate';
/** Bounded: many profiles / repeated logins must not grow the cache forever. */
const HOME_CACHE_KEEP = 6;

interface HomeCacheEntry {
  /** ms epoch of the FETCH that produced `data` (0 = never fetched / legacy). */
  updatedAt: number;
  data: HomePageData[];
}

const readHomeCache = (sig: string): HomeCacheEntry | undefined => {
  try {
    const raw = cacheStorage.getString(HOME_CACHE_PREFIX + sig);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data)) {
        return {updatedAt: Number(parsed.updatedAt) || 0, data: parsed.data};
      }
    }
    const legacy = cacheStorage.getString(HOME_CACHE_LEGACY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (parsed && Array.isArray(parsed.data) && parsed.sig === sig) {
        // No timestamp in the old slot: seeds as stale, so it repaints at once
        // and refetches — the previous behaviour, minus the spinner.
        return {updatedAt: 0, data: parsed.data};
      }
    }
  } catch {}
  return undefined;
};

const writeHomeCache = (sig: string, entry: HomeCacheEntry): void => {
  try {
    cacheStorage.setString(HOME_CACHE_PREFIX + sig, JSON.stringify(entry));
    let index: string[] = [];
    try {
      const parsed = JSON.parse(cacheStorage.getString(HOME_CACHE_INDEX) || '[]');
      if (Array.isArray(parsed)) {
        index = parsed.filter((s: unknown) => typeof s === 'string');
      }
    } catch {}
    index = [sig, ...index.filter(s => s !== sig)];
    const evicted = index.slice(HOME_CACHE_KEEP);
    index = index.slice(0, HOME_CACHE_KEEP);
    evicted.forEach(s => cacheStorage.delete(HOME_CACHE_PREFIX + s));
    cacheStorage.setString(HOME_CACHE_INDEX, JSON.stringify(index));
    cacheStorage.delete(HOME_CACHE_LEGACY);
  } catch {}
};

interface UseHomePageDataOptions {
  provider: Content['provider'];
  enabled?: boolean;
}

export const useHomePageData = ({
  provider,
  enabled = true,
}: UseHomePageDataOptions) => {
  const installedProviders = useContentStore(state => state.installedProviders);
  const homeProviderValue = useContentStore(state => state.homeProviderValue);
  const token = useAuthStore(s => s.token);
  const entAllowed = useEntitlementStore(s => s.allowed);
  const activeProfileId = useProfileStore(s => s.activeId);

  // Keep entitlements fresh (login/logout drives this too via the store).
  useEffect(() => {
    useEntitlementStore.getState().refresh();
  }, [token]);

  const providersToFetch = React.useMemo(() => {
    if (!installedProviders || installedProviders.length === 0) return [provider];
    let candidates: any[] = [];
    // Active profile's explicit provider set wins over the global home picker.
    const profile = useProfileStore.getState().activeProfile();
    if (profile?.providers) {
      const vals = profile.providers;
      const matched = installedProviders.filter((p: any) => vals.includes(p.value));
      if (matched.length > 0) {
        candidates = matched;
      }
    }
    if (candidates.length === 0 && homeProviderValue) {
      const vals = homeProviderValue.split(',').filter(Boolean);
      if (vals.length > 0) {
        const matched = installedProviders.filter((p: any) => vals.includes(p.value));
        if (matched.length > 0) {
          candidates = matched;
        }
      }
    }
    if (candidates.length === 0) {
      const homeProviders = installedProviders.filter((p: any) => p.show_on_home !== false);
      candidates = homeProviders.length > 0 ? homeProviders : installedProviders;
    }
    // Entitlement gate: anonymous/open-catalog devices never fetch
    // admin-granted (`selected`) providers; signed-in restricted accounts
    // fetch exactly the providers the server granted them.
    return useEntitlementStore.getState().applyTo(candidates);
  }, [installedProviders, entAllowed, provider, homeProviderValue, activeProfileId]);

  const cacheSig = React.useMemo(
    () =>
      [
        activeProfileId || 'nopf',
        providersToFetch.map((p: any) => p.value).sort().join(','),
        token || 'anon',
      ].join('|'),
    [activeProfileId, providersToFetch, token],
  );

  const queryClient = useQueryClient();

  const queryKey = React.useMemo(
    () => [
      'homePageData',
      'aggregate',
      activeProfileId || 'nopf',
      providersToFetch.map((p: any) => p.value).sort().join(','),
      token || 'anon',
    ],
    [activeProfileId, providersToFetch, token],
  );

  // Parsed once per signature rather than on every render.
  const cachedHome = React.useMemo(() => readHomeCache(cacheSig), [cacheSig]);

  const query = useQuery<HomePageData[], Error>({
    queryKey,
    queryFn: async ({signal}) => {
      // Published the moment each provider settles. The fast provider (3 rows)
      // used to be held hostage by the slow one (13 rows) behind a single
      // Promise.allSettled, so the screen showed skeletons the whole time and
      // then every row at once.
      const partial: Array<HomePageData[] | undefined> = new Array(
        providersToFetch.length,
      );
      const publishPartial = () => {
        const merged: HomePageData[] = [];
        for (const list of partial) {
          if (list && list.length > 0) {
            merged.push(...list);
          }
        }
        if (merged.length > 0) {
          queryClient.setQueryData<HomePageData[]>(queryKey, merged);
        }
      };

      const results = await Promise.allSettled(
        providersToFetch.map(async (prov: any, index: number) => {
          if (signal.aborted) return [];
          const data = await getHomePageData(prov, signal);
          const mapped = data.map(section => ({
            ...section,
            title: section.title,
            // Section-level provider tag: the "All" page must load posts from
            // the provider the section actually came from, not the currently
            // selected provider in the store.
            provider: prov.value,
            Posts: (section.Posts || []).map(post => ({
              ...post,
              provider: prov.value,
            })),
          }));
          partial[index] = mapped;
          publishPartial();
          return mapped;
        }),
      );

      const allData: HomePageData[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allData.push(...result.value);
        }
      }

      if (allData.length > 0) {
        // Off the paint frame: this maps and stringifies every post on the
        // home screen, and it used to run the instant the rows landed.
        InteractionManager.runAfterInteractions(() => {
          syncToServer(provider.value, allData).catch(() => {});
        });
      }

      return allData;
    },
    enabled: enabled && !!provider?.value,
    staleTime: 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error.name === 'AbortError') {
        return false;
      }
      return failureCount < 2;
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 15000),
    initialData: cachedHome?.data,
    // When those rows were ACTUALLY fetched. The old `0` marked warm cache as
    // stale the instant it existed, so `refetchOnMount` fired on every mount.
    initialDataUpdatedAt: cachedHome?.updatedAt ?? 0,
    // With the real timestamp, a Home return inside staleTime paints from
    // cache with no request at all; older content repaints immediately and
    // refreshes behind it. (v5: `true` = refetch only when stale, which is
    // exactly the "stale" semantics; 'always' was what forced a refetch on
    // every single mount.)
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'always',
  });

  // Coalesce the cache write. `publishPartial()` re-publishes the merged
  // dataset once PER provider settle (~8-16 times per load), and every
  // publish gave `query.data` a new identity — so this effect used to
  // JSON.stringify the ENTIRE home catalogue (every row, every post) into
  // MMKV that many times in a row, all during the paint window. A trailing
  // 1.5s timer turns it into one write, and the ref below lets us still
  // flush the newest entry if the screen unmounts first.
  const pendingCacheRef = useRef<{sig: string; entry: HomeCacheEntry} | null>(
    null,
  );
  useEffect(() => {
    if (!query.data || query.data.length === 0) {
      return;
    }
    const next = {
      sig: cacheSig,
      entry: {
        // dataUpdatedAt is 0 only while nothing has ever been fetched, which
        // we do not want to persist as "fresh".
        updatedAt: query.dataUpdatedAt || 0,
        data: query.data,
      },
    };
    pendingCacheRef.current = next;
    const timer = setTimeout(() => {
      pendingCacheRef.current = null;
      writeHomeCache(next.sig, next.entry);
    }, 1500);
    return () => clearTimeout(timer);
  }, [query.data, query.dataUpdatedAt, cacheSig]);

  useEffect(() => {
    return () => {
      const pending = pendingCacheRef.current;
      if (pending) {
        pendingCacheRef.current = null;
        writeHomeCache(pending.sig, pending.entry);
      }
    };
  }, []);

  // The Home screen needs the exact provider set to draw skeletons that match
  // the rows that are coming (previously it skeletonised the ONE selected
  // provider, so3 shimmer rows were replaced by 16 real ones in one jump).
  return Object.assign(query, {providersToFetch});
};

const heroSelectionCache = new Map<
  string,
  {postIndex: number; categoryIndex: number}
>();

export const getRandomHeroPost = (
  homeData: HomePageData[],
  providerValue?: string,
) => {
  if (!homeData || homeData.length === 0) {
    return null;
  }

  const populatedCategories = homeData
    .map((category, categoryIndex) => ({category, categoryIndex}))
    .filter(({category}) => category.Posts?.length > 0);
  if (populatedCategories.length === 0) {
    return null;
  }

  const cacheKey = providerValue || 'default';
  const cached = heroSelectionCache.get(cacheKey);

  const cachedCategory = cached ? homeData[cached.categoryIndex] : undefined;
  if (
    cached &&
    cachedCategory?.Posts &&
    cached.postIndex < cachedCategory.Posts.length
  ) {
    return cachedCategory.Posts[cached.postIndex];
  }

  const randomCategory =
    populatedCategories[Math.floor(Math.random() * populatedCategories.length)];
  const randomPostIndex = Math.floor(
    Math.random() * randomCategory.category.Posts.length,
  );
  heroSelectionCache.set(cacheKey, {
    postIndex: randomPostIndex,
    categoryIndex: randomCategory.categoryIndex,
  });

  return randomCategory.category.Posts[randomPostIndex];
};

export const clearHeroCache = (providerValue?: string) => {
  if (providerValue) {
    heroSelectionCache.delete(providerValue);
  } else {
    heroSelectionCache.clear();
  }
};

export const useHeroMetadata = (heroLink: string, providerValue: string) => {
  const cacheKey = `heroMeta:${providerValue}:${heroLink}`;
  const query = useQuery({
    queryKey: ['heroMetadata', heroLink, providerValue],
    queryFn: async () => {
      const {providerManager} = await import('../services/ProviderManager');
      const {default: axios} = await import('axios');

      const info = await providerManager.getMetaData({
        link: heroLink,
        provider: providerValue,
      });

      if (info.populateMeta === true && info.imdbId && info.type) {
        try {
          const response = await axios.get(
            `https://v3-cinemeta.strem.io/meta/${info.type}/${info.imdbId}.json`,
            {timeout: 5000},
          );
          return response.data?.meta || info;
        } catch {
          return info;
        }
      }

      return info;
    },
    enabled: !!heroLink && !!providerValue,
    staleTime: 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    initialData: () => {
      const cached =
        cacheStorage.getString(cacheKey) || cacheStorage.getString(heroLink);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
    initialDataUpdatedAt: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (query.data && heroLink) {
      cacheStorage.setString(cacheKey, JSON.stringify(query.data));
      cacheStorage.setString(heroLink, JSON.stringify(query.data));
    }
  }, [cacheKey, heroLink, query.data]);

  return query;
};
