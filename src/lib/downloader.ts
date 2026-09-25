import {ifExists} from './file/ifExists';
import {
  ensureDownloadLocationAccess,
  getDownloadFileName,
} from './downloadLocation';
import {ToastAndroid} from 'react-native';
import {scheduleQueuedDownloads} from './downloadManager';
import {settingsStorage} from './storage';
import useDownloadsStore, {
  DownloadMediaInput,
  DownloadSubtitle,
  DownloadSourceType,
} from './zustand/downloadsStore';

import type {SkipInterval} from './providers/types';

const getSourceType = (url: string, fileType: string): DownloadSourceType => {
  if (fileType === 'torrent' || url.startsWith('magnet:')) {
    return 'torrent';
  }
  if (fileType === 'm3u8') {
    return 'hls';
  }
  return 'http';
};

export const downloadManager = async ({
  downloadId,
  title,
  showName,
  episodeName,
  seasonTitle,
  mediaType,
  imdbId,
  poster,
  background,
  synopsis,
  provider,
  server,
  isSubtitle,
  infoUrl,
  sourceLink,
  url,
  fileName,
  fileType,
  headers,
  subtitles,
  skip,
}: {
  downloadId: string;
  title: string;
  showName?: string;
  episodeName?: string;
  seasonTitle?: string;
  mediaType: 'movie' | 'series';
  imdbId?: string;
  poster?: string;
  background?: string;
  synopsis?: string;
  provider?: string;
  server?: string;
  isSubtitle?: boolean;
  infoUrl?: string;
  sourceLink?: string;
  url: string;
  fileName: string;
  fileType: string;
  headers?: Record<string, string>;
  subtitles?: DownloadSubtitle[];
  skip?: SkipInterval[];
  deleteDownload: () => void;
}): Promise<void> => {
  const store = useDownloadsStore.getState();
  if (store.downloads[downloadId]?.status === 'completed') {
    return;
  }

  let downloadLocation: Awaited<
    ReturnType<typeof ensureDownloadLocationAccess>
  >;
  try {
    downloadLocation = await ensureDownloadLocationAccess(
      settingsStorage.getDownloadLocationConfig(),
    );
  } catch (error) {
    // A throw here (native bridge hiccup, storage parse failure) previously
    // vanished silently — surface it so the user knows why nothing started.
    ToastAndroid.show(
      `ডাউনলোড শুরু করা যায়নি: ${error instanceof Error ? error.message : String(error)}`,
      ToastAndroid.LONG,
    );
    return;
  }
  if (!downloadLocation) {
    // Never fail silently: a broken saved location (e.g. after reinstall
    // wiped SAF grants) previously returned quietly and the download just
    // sat as "failed" with no cause shown.
    ToastAndroid.show(
      'ডাউনলোড ফোল্ডার নির্বাচন করা হয়নি — Settings > Download location সেট করুন',
      ToastAndroid.LONG,
    );
    return;
  }
  settingsStorage.setDownloadLocation(downloadLocation);

  const outputFileType = fileType === 'm3u8' ? 'mp4' : fileType;
  const media: DownloadMediaInput = {
    id: downloadId,
    title,
    showName,
    episodeName,
    seasonTitle,
    type: mediaType,
    imdbId,
    poster,
    background,
    synopsis,
    provider,
    server,
    isSubtitle,
    infoUrl,
    sourceLink,
    subtitles,
    skip,
    displayFileName: getDownloadFileName(fileName, outputFileType),
  };
  const existingFile = await ifExists(fileName);
  if (existingFile) {
    store.enqueueDownload({
      ...media,
      url,
      headers,
      videoType: outputFileType,
      sourceType: getSourceType(url, fileType),
      filePath: String(existingFile),
      status: 'completed',
      legacy: true,
    });
    return;
  }

  store.enqueueDownload({
    ...media,
    url,
    headers,
    videoType: outputFileType,
    sourceType: getSourceType(url, fileType),
    downloadLocation,
    filePath: '',
    status: 'queued',
  });

  await scheduleQueuedDownloads();
};
