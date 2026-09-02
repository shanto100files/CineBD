import React, {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getHomePageData, HomePageData} from '../getHomepagedata';
import {Content} from '../zustand/contentStore';
import {cacheStorage} from '../storage';
import useContentStore from '../zustand/contentStore';
import axios from 'axios';
import {useAuthStore} from '../zustand/authStore';

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

async function fetchMyProviders(token: string): Promise<string[] | null> {
  try {
    const res = await axios.get('https://cinepix.top/api/app/myproviders', {
      headers: {Authorization: `Bearer ${token}`},
      timeout: 8000,
    });
    if (res.data.all) return null;
    return (res.data.providers || []).map((p: any) => p.value);
  } catch {
    return null;
  }
}

export const useHomePageData = ({
  provider,
  enabled = true,
}: UseHomePageDataOptions) => {
  const installedProviders = useContentStore(state => state.installedProviders);
  const token = useAuthStore(s => s.token);
  const [allowedProviders, setAllowedProviders] = useState<string[] | null>(null);

  useEffect(() => {
    if (!token) { setAllowedProviders(null); return; }
    fetchMyProviders(token).then(setAllowedProviders);
  }, [token]);

  const providersToFetch = React.useMemo(() => {
    if (!installedProviders || installedProviders.length === 0) return [provider];
    if (allowedProviders === null) return installedProviders;
    return installedProviders.filter(p => allowedProviders.includes(p.value));
  }, [installedProviders, allowedProviders, provider]);

  const query = useQuery<HomePageData[], Error>({
    queryKey: ['homePageData', 'aggregate', providersToFetch.map(p => p.value).sort().join(','), token || 'anon'],
    queryFn: async ({signal}) => {
      const allData: HomePageData[] = [];

      const fetches = providersToFetch.map(async prov => {
        try {
          const data = await getHomePageData(prov, signal);
          return data.map(section => ({
            ...section,
            title: `${prov.display_name} — ${section.title}`,
            Posts: (section.Posts || []).map(post => ({
              ...post,
              provider: prov.value,
            })),
          }));
        } catch {
          return [];
        }
      });

      const results = await Promise.allSettled(fetches);
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.length > 0) {
          allData.push(...result.value);
        }
      });

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
      const cache = cacheStorage.getString('homeDataAggregate');
      if (cache) {
        try {
          return JSON.parse(cache);
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
      cacheStorage.setString('homeDataAggregate', JSON.stringify(query.data));
    }
  }, [query.data]);

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
