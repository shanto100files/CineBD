export interface Post {
  title: string;
  link: string;
  image?: string;
  banner?: string;
  id?: string;
  episodesLink?: string;
}

export interface Catalog {
  title: string;
  filter: string;
}

export interface TextTrack {
  title: string;
  language: string;
  type: string;
  uri: string;
}

export interface SkipInterval {
  title?: string;
  from: number;
  to: number;
}

export interface Stream {
  server: string;
  link: string;
  type: string;
  quality?: string;
  subtitles?: TextTrack[];
  headers?: Record<string, string>;
  skip?: SkipInterval[];
}

export interface Link {
  title: string;
  quality?: string;
  episodesLink?: string;
  directLinks?: {
    title: string;
    link: string;
    type?: 'movie' | 'series';
    description?: string;
    image?: string;
    quickDownload?: boolean;
    skip?: SkipInterval[];
  }[];
}

export interface Info {
  title: string;
  image: string;
  logo?: string;
  poster?: string;
  synopsis: string;
  imdbId?: string;
  tmdbId?: number | string;
  type: string;
  quickDownload?: boolean;
  populateMeta?: boolean;
  webUrl?: string;
  tags?: string[];
  cast?: string[];
  rating?: string;
  trailerUrl?: string;
  linkList: Link[];
}

export interface EpisodeLink {
  id?: string;
  title: string;
  link: string;
  sourceLink?: string;
  description?: string;
  image?: string;
  quickDownload?: boolean;
  skip?: SkipInterval[];
}

export interface ProviderContext {
  axios: any;
  getBaseUrl: (v: string) => Promise<string>;
  commonHeaders: Record<string, string>;
  Crypto: any;
  cheerio: any;
  openWebView: any;
  kvStore?: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<boolean>;
  };
}
