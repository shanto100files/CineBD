import React, {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
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

  const query = useQuery<HomePageData[], Error>({
    queryKey: ['homePageData', 'aggregate', activeProfileId || 'nopf', providersToFetch.map(p => p.value).sort().join(','), token || 'anon'],
    queryFn: async ({signal}) => {
      const allData: HomePageData[] = [];

      const results = await Promise.allSettled(
        providersToFetch.map(async prov => {
          if (signal.aborted) return [];
          const data = await getHomePageData(prov, signal);
          return data.map(section => ({
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
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allData.push(...result.value);
        }
      }

      if (allData.length > 0) {
        syncToServer(provider.value, allData).catch(() => {});
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
    initialData: () => {
      // The aggregate cache is shared by every profile/provider. Seeding a
      // NEW query (a profile switch changes the key) with it used to paint
      // the previous profile's rows instantly and then flip the whole screen
      // at once when the real fetch landed — no loader, stale content. Only
      // reuse the cache when it was written for exactly this identity.
      const cache = cacheStorage.getString('homeDataAggregate');
      if (cache) {
        try {
          const parsed = JSON.parse(cache);
          if (
            parsed &&
            Array.isArray(parsed.data) &&
            parsed.sig === cacheSig
          ) {
            return parsed.data;
          }
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
    initialDataUpdatedAt: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'always',
  });

  useEffect(() => {
    if (query.data && query.data.length > 0) {
      cacheStorage.setString(
        'homeDataAggregate',
        JSON.stringify({sig: cacheSig, data: query.data}),
      );
    }
  }, [query.data, cacheSig]);

  return query;
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
