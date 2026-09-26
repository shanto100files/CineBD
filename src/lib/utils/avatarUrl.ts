const API_ORIGIN = 'https://cinepix.top';

export const absoluteAvatarUrl = (url?: string | null): string | null => {
  if (!url) return null;
  return url.startsWith('/') ? API_ORIGIN + url : url;
};
