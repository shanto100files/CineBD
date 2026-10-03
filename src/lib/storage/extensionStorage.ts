import {mainStorage} from './StorageService';

/**
 * Provider Source
 */
export interface ProviderSource {
  author: string;
  url: string;
  isDefault?: boolean;
}

/**
 * Provider extension metadata
 */
export interface ProviderExtension {
  value: string;
  display_name: string;
  source: {author: string; url: string};
  version: string;
  icon: string;
  disabled: boolean;
  type: 'global' | 'english' | 'india' | 'italy' | 'anime' | 'drama';
  installed: boolean;
  /** 18+ provider — hidden unless the user passed the age gate. */
  is_adult?: boolean;
  /** Server access mode: 'all' = self-selectable/open, 'selected' = admin-grant/coupon only. */
  access_mode?: 'all' | 'selected';
  hasSettings?: boolean;
  /** Server-flagged: hide local download UI (e.g. m3u8-only providers). */
  streamOnly?: boolean;
  /** Server-flagged: show on home aggregate (false = tools/profiles only). */
  show_on_home?: boolean;
  installedAt?: number;
  lastUpdated?: number;
}

/**
 * Provider module cache
 */
export interface ProviderModule {
  value: string;
  sourceAuthor?: string;
  version: string;
  modules: {
    posts?: string;
    meta?: string;
    stream?: string;
    catalog?: string;
    episodes?: string;
    settings?: string;
  };
  cachedAt: number;
}

/**
 * Storage keys for extensions
 */
export enum ExtensionKeys {
  INSTALLED_PROVIDERS = 'installedProviders',
  AVAILABLE_PROVIDERS = 'availableProviders',
  PROVIDER_SOURCES = 'providerSources',
  PROVIDER_MODULES = 'providerModules',
  MANIFEST_CACHE = 'manifestCache',
  LAST_MANIFEST_FETCH = 'lastManifestFetch',
}

/**
 * Parsed-MMKV memos for the two arrays on the fetch hot path.
 *
 * `PROVIDER_MODULES` stores the FULL JavaScript source of every installed
 * plugin (hundreds of KB to MBs) and `INSTALLED_PROVIDERS` the whole provider
 * list. Both used to be JSON-parsed from MMKV on every single read, and
 * `ProviderManager.getModule()` reads them once PER provider call
 * (catalog/posts/meta/stream/episodes), so one home refresh reparsed that
 * blob dozens of times on the main thread.
 *
 * Both keys are only ever written through `setArray`/`delete` below, so an
 * invalidating memo is always in sync with storage. Reads stay defensive:
 * `getInstalledProviders()` hands out a copy so a caller sorting in place
 * cannot poison the memo.
 */
let installedProvidersMemo: ProviderExtension[] | null = null;
let providerModulesMemo: ProviderModule[] | null = null;

const readInstalledProviders = (): ProviderExtension[] => {
  if (!installedProvidersMemo) {
    installedProvidersMemo =
      mainStorage.getArray<ProviderExtension>(
        ExtensionKeys.INSTALLED_PROVIDERS,
      ) || [];
  }
  return installedProvidersMemo;
};

const readProviderModules = (): ProviderModule[] => {
  if (!providerModulesMemo) {
    providerModulesMemo =
      mainStorage.getArray<ProviderModule>(ExtensionKeys.PROVIDER_MODULES) || [];
  }
  return providerModulesMemo;
};

const invalidateInstalledProviders = () => {
  installedProvidersMemo = null;
};

const invalidateProviderModules = () => {
  providerModulesMemo = null;
};

/**
 * Extension storage manager
 */
export class ExtensionStorage {
  private normalizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private scopedKey(baseKey: string, author?: string): string {
    if (!author) {
      return baseKey;
    }
    return `${baseKey}_${author}`;
  }

  private isProviderMatch(
    provider: ProviderExtension,
    providerValue: string,
    sourceAuthor?: string,
  ): boolean {
    if (provider.value !== providerValue) {
      return false;
    }
    if (!sourceAuthor) {
      return true;
    }
    return provider.source?.author === sourceAuthor;
  }

  private isModuleMatch(
    module: ProviderModule,
    providerValue: string,
    sourceAuthor?: string,
  ): boolean {
    if (module.value !== providerValue) {
      return false;
    }
    if (!sourceAuthor) {
      return true;
    }
    return module.sourceAuthor === sourceAuthor;
  }

  /**
   * Add provider sources
   */
  addProviderSources(author: string, url: string): void {
    const normalizedAuthor = author.trim();
    const normalizedUrl = this.normalizeUrl(url);
    if (!normalizedAuthor || !normalizedUrl) {
      return;
    }

    const sources =
      mainStorage.getArray<ProviderSource>(ExtensionKeys.PROVIDER_SOURCES) ||
      [];

    const existingIndex = sources.findIndex(s => s.author === normalizedAuthor);
    if (existingIndex >= 0) {
      sources[existingIndex] = {
        ...sources[existingIndex],
        url: normalizedUrl,
      };
    } else {
      sources.push({
        author: normalizedAuthor,
        url: normalizedUrl,
        isDefault: sources.length === 0,
      });
    }

    if (!sources.some(s => s.isDefault) && sources.length > 0) {
      sources[0].isDefault = true;
    }

    mainStorage.setArray(ExtensionKeys.PROVIDER_SOURCES, sources);
  }

  /**
   * Get provider sources
   */
  getProviderSource(getDefault = true): ProviderSource | undefined {
    const sources =
      mainStorage.getArray<ProviderSource>(ExtensionKeys.PROVIDER_SOURCES) ||
      [];
    if (sources.length === 0) {
      return undefined;
    }
    return getDefault
      ? sources.find(s => s.isDefault) || sources[0]
      : sources[0];
  }

  /**
   * Get all provider sources
   */
  getProviderSources(): ProviderSource[] {
    return (
      mainStorage.getArray<ProviderSource>(ExtensionKeys.PROVIDER_SOURCES) || []
    );
  }

  /**
   * Remove Provider source
   */
  removeProviderSource(author: string): void {
    const sources =
      mainStorage.getArray<ProviderSource>(ExtensionKeys.PROVIDER_SOURCES) ||
      [];
    const removedDefault = sources.find(s => s.author === author)?.isDefault;
    const filtered = sources.filter(s => s.author !== author);

    if (
      filtered.length > 0 &&
      (removedDefault || !filtered.some(s => s.isDefault))
    ) {
      filtered[0] = {...filtered[0], isDefault: true};
      for (let i = 1; i < filtered.length; i += 1) {
        filtered[i] = {...filtered[i], isDefault: false};
      }
    }

    mainStorage.setArray(ExtensionKeys.PROVIDER_SOURCES, filtered);
  }

  /**
   * Set default provider source
   */
  setDefaultProviderSource(author: string): void {
    const sources =
      mainStorage.getArray<ProviderSource>(ExtensionKeys.PROVIDER_SOURCES) ||
      [];
    if (!sources.some(s => s.author === author)) {
      return;
    }

    const updated = sources.map(s => ({
      ...s,
      isDefault: s.author === author,
    }));
    mainStorage.setArray(ExtensionKeys.PROVIDER_SOURCES, updated);
  }

  /**
   * Get installed providers
   */
  getInstalledProviders(): ProviderExtension[] {
    // Copy, not the memo: callers filter/sort in place and must not poison it.
    return readInstalledProviders().slice();
  }

  /**
   * Set installed providers
   */
  setInstalledProviders(providers: ProviderExtension[]): void {
    mainStorage.setArray(ExtensionKeys.INSTALLED_PROVIDERS, providers);
    invalidateInstalledProviders();
  }

  /**
   * Get available providers
   */
  getAvailableProviders(author = ''): ProviderExtension[] {
    return (
      mainStorage.getArray<ProviderExtension>(
        this.scopedKey(ExtensionKeys.AVAILABLE_PROVIDERS, author),
      ) || []
    );
  }

  /**
   * Set available providers
   */
  setAvailableProviders(author: string, providers: ProviderExtension[]): void {
    mainStorage.setArray(
      this.scopedKey(ExtensionKeys.AVAILABLE_PROVIDERS, author),
      providers,
    );
  }

  /**
   * Install a provider
   */
  installProvider(provider: ProviderExtension): void {
    const installed = this.getInstalledProviders();
    const existing = installed.find(
      p =>
        p.value === provider.value &&
        p.source?.author === provider.source?.author,
    );

    if (existing) {
      // Update existing provider — propagate ALL manifest-driven fields so
      // admin-side changes (18+ mark, rename, icon, mode) reach devices.
      existing.version = provider.version;
      existing.source = provider.source;
      existing.display_name = provider.display_name;
      existing.icon = provider.icon;
      existing.is_adult = provider.is_adult;
      existing.access_mode = provider.access_mode;
      existing.streamOnly = provider.streamOnly;
      existing.hasSettings = provider.hasSettings ?? existing.hasSettings;
      existing.lastUpdated = Date.now();
    } else {
      // Add new provider
      installed.push({
        ...provider,
        source: {
          author: provider.source.author,
          url: provider.source.url,
        },
        installed: true,
        installedAt: Date.now(),
      });
    }

    this.setInstalledProviders(installed);
  }

  /**
   * Uninstall a provider
   */
  uninstallProvider(providerValue: string, sourceAuthor?: string): void {
    const installed = this.getInstalledProviders();
    const filtered = installed.filter(
      p => !this.isProviderMatch(p, providerValue, sourceAuthor),
    );
    this.setInstalledProviders(filtered);

    // Also remove cached modules
    this.removeProviderModules(providerValue, sourceAuthor);
  }

  /**
   * Check if provider is installed
   */
  isProviderInstalled(providerValue: string, sourceAuthor?: string): boolean {
    const installed = this.getInstalledProviders();
    return installed.some(p =>
      this.isProviderMatch(p, providerValue, sourceAuthor),
    );
  }

  /**
   * Get provider modules cache
   */
  getProviderModules(
    providerValue: string,
    sourceAuthor?: string,
  ): ProviderModule | undefined {
    const providerMatches = readProviderModules().filter(
      m => m.value === providerValue,
    );

    if (providerMatches.length === 0) {
      return undefined;
    }

    if (sourceAuthor) {
      const exactMatch = providerMatches.find(
        m => m.sourceAuthor === sourceAuthor,
      );
      if (exactMatch) {
        return exactMatch;
      }

      return providerMatches.find(m => !m.sourceAuthor);
    }

    const activeSourceAuthor = this.getProviderSource()?.author;
    if (activeSourceAuthor) {
      const activeSourceMatch = providerMatches.find(
        m => m.sourceAuthor === activeSourceAuthor,
      );
      if (activeSourceMatch) {
        return activeSourceMatch;
      }
    }

    // Prefer source-scoped cache over legacy unscoped entries.
    const scopedMatches = providerMatches.filter(m => !!m.sourceAuthor);
    if (scopedMatches.length > 0) {
      return scopedMatches.reduce((latest, current) =>
        current.cachedAt > latest.cachedAt ? current : latest,
      );
    }

    return providerMatches.reduce((latest, current) =>
      current.cachedAt > latest.cachedAt ? current : latest,
    );
  }

  /**
   * Cache provider modules
   */
  cacheProviderModules(modules: ProviderModule): void {
    // Copy — the memo array is shared and must never be mutated in place.
    const allModules = readProviderModules().slice();

    const existingIndex = allModules.findIndex(
      m =>
        m.value === modules.value &&
        (m.sourceAuthor || '') === (modules.sourceAuthor || ''),
    );

    if (existingIndex >= 0) {
      allModules[existingIndex] = modules;
    } else {
      allModules.push(modules);
    }

    mainStorage.setArray(ExtensionKeys.PROVIDER_MODULES, allModules);
    invalidateProviderModules();
  }

  /**
   * Remove provider modules from cache
   */
  removeProviderModules(providerValue: string, sourceAuthor?: string): void {
    const allModules = readProviderModules().slice();

    const filtered = allModules.filter(
      m => !this.isModuleMatch(m, providerValue, sourceAuthor),
    );
    mainStorage.setArray(ExtensionKeys.PROVIDER_MODULES, filtered);
    invalidateProviderModules();
  }

  /**
   * Get manifest cache
   */
  getManifestCache(author?: string): ProviderExtension[] {
    return (
      mainStorage.getArray<ProviderExtension>(
        this.scopedKey(ExtensionKeys.MANIFEST_CACHE, author),
      ) || []
    );
  }

  /**
   * Set manifest cache
   */
  setManifestCache(manifest: ProviderExtension[], author?: string): void {
    mainStorage.setArray(
      this.scopedKey(ExtensionKeys.MANIFEST_CACHE, author),
      manifest,
    );
    mainStorage.setNumber(
      this.scopedKey(ExtensionKeys.LAST_MANIFEST_FETCH, author),
      Date.now(),
    );
  }

  /**
   * Get last manifest fetch time
   */
  getLastManifestFetch(author?: string): number {
    return (
      mainStorage.getNumber(
        this.scopedKey(ExtensionKeys.LAST_MANIFEST_FETCH, author),
      ) || 0
    );
  }

  /**
   * Check if manifest cache is expired (24 hours)
   */
  isManifestCacheExpired(author?: string): boolean {
    const lastFetch = this.getLastManifestFetch(author);
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return now - lastFetch > twentyFourHours;
  }

  /**
   * Get providers that need updates
   */
  getProvidersNeedingUpdate(author: string): ProviderExtension[] {
    const installed = this.getInstalledProviders().filter(
      p => p.source?.author === author,
    );
    const available = this.getAvailableProviders(author);

    return installed.filter(installedProvider => {
      const availableProvider = available.find(
        p => p.value === installedProvider.value,
      );
      return (
        availableProvider &&
        availableProvider.version !== installedProvider.version
      );
    });
  }

  /**
   * Clear all extension data
   */
  clearAll(): void {
    const sources = this.getProviderSources();

    mainStorage.delete(ExtensionKeys.INSTALLED_PROVIDERS);
    mainStorage.delete(ExtensionKeys.AVAILABLE_PROVIDERS);
    mainStorage.delete(ExtensionKeys.PROVIDER_MODULES);
    invalidateInstalledProviders();
    invalidateProviderModules();
    mainStorage.delete(ExtensionKeys.MANIFEST_CACHE);
    mainStorage.delete(ExtensionKeys.LAST_MANIFEST_FETCH);

    sources.forEach(source => {
      mainStorage.delete(
        this.scopedKey(ExtensionKeys.AVAILABLE_PROVIDERS, source.author),
      );
      mainStorage.delete(
        this.scopedKey(ExtensionKeys.MANIFEST_CACHE, source.author),
      );
      mainStorage.delete(
        this.scopedKey(ExtensionKeys.LAST_MANIFEST_FETCH, source.author),
      );
    });

    mainStorage.delete(ExtensionKeys.PROVIDER_SOURCES);
  }
}

/**
 * Global extension storage instance
 */
export const extensionStorage = new ExtensionStorage();
