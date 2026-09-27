import {mainStorage} from './StorageService';

/**
 * Storage key for watchlist
 */
export enum WatchListKeys {
  WATCH_LIST = 'watchlist',
}

/**
 * Interface for watchlist item
 */
export interface WatchListItem {
  title: string;
  poster: string;
  link: string;
  provider: string;
  updatedAt?: number;
}

/**
 * Watchlist storage manager.
 * Supports per-profile scoping: each profile gets its own MMKV key
 * (`watchlist:pf:<id>`); the legacy key holds the scopeless list.
 */
export class WatchListStorage {
  private keyFor(scope?: string): string {
    return scope ? `${WatchListKeys.WATCH_LIST}:pf:${scope}` : WatchListKeys.WATCH_LIST;
  }

  private readKey(key: string): WatchListItem[] {
    const watchList = mainStorage.getArray<Partial<WatchListItem>>(key) || [];
    return watchList
      .filter(item => Boolean(item.title && item.link && item.provider))
      .map(item => ({...item, poster: item.poster || ''}) as WatchListItem);
  }

  private writeKey(key: string, list: WatchListItem[]) {
    mainStorage.setArray(key, list);
  }

  /**
   * Get all watchlist items (optionally for a profile scope).
   */
  getWatchList(scope?: string): WatchListItem[] {
    return this.readKey(this.keyFor(scope));
  }

  /**
   * Add an item to the watchlist (optionally in a profile scope).
   */
  addToWatchList(item: WatchListItem, scope?: string): WatchListItem[] {
    if (!item.provider) {
      return this.getWatchList(scope);
    }
    const key = this.keyFor(scope);
    const watchList = this.readKey(key);

    // Filter out any existing item with the same link
    const newWatchList = watchList.filter(i => i.link !== item.link);

    // Add the new item to the end
    newWatchList.push({...item, updatedAt: Date.now()});

    // Save the updated watchlist
    this.writeKey(key, newWatchList);

    return newWatchList;
  }

  /**
   * Remove an item from the watchlist (optionally in a profile scope).
   */
  removeFromWatchList(link: string, scope?: string): WatchListItem[] {
    const key = this.keyFor(scope);
    const newWatchList = this.readKey(key).filter(item => item.link !== link);

    this.writeKey(key, newWatchList);

    return newWatchList;
  }

  /**
   * Clear all items from the watchlist (optionally in a profile scope).
   */
  clearWatchList(scope?: string): WatchListItem[] {
    const emptyList: WatchListItem[] = [];
    this.writeKey(this.keyFor(scope), emptyList);
    return emptyList;
  }

  /**
   * Check if an item exists in the watchlist (optionally in a profile scope).
   */
  isInWatchList(link: string, scope?: string): boolean {
    return this.readKey(this.keyFor(scope)).some(item => item.link === link);
  }

  /** Delete a profile's whole scoped list (when the profile is deleted). */
  deleteScope(scope: string) {
    try {
      mainStorage.delete(this.keyFor(scope));
    } catch {}
  }
}

// Export a singleton instance
export const watchListStorage = new WatchListStorage();
