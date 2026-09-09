import React, {useEffect, useState, useRef} from 'react';
import {View, StyleSheet, Linking, ActivityIndicator, Image, Text, TouchableOpacity, BackHandler, Platform} from 'react-native';
import * as Application from 'expo-application';
import axios from 'axios';
import * as RNFS from '@dr.pogodin/react-native-fs';
import notifee from '@notifee/react-native';

const API = 'https://cinepix.top/api/app';

interface Props {
  killSwitchBlocked?: boolean;
  reason?: string;
}

type ScreenStatus = 'kill_blocked' | 'checking' | 'update_required' | 'ok' | 'network_error' | 'downloading' | 'download_done';

export default function ForceUpdateScreen({killSwitchBlocked, reason}: Props) {
  const [status, setStatus] = useState<ScreenStatus>(killSwitchBlocked ? 'kill_blocked' : 'checking');
  const [latestVersion, setLatestVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [changelog, setChangelog] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!killSwitchBlocked) {
      checkVersion();
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      sub.remove();
      abortRef.current?.abort();
    };
  }, []);

  const checkVersion = async () => {
    try {
      const res = await axios.get(`${API}/versioncheck`, {timeout: 10000});
      const {min_version, latest_version, download_url, changelog: cl, force_update} = res.data;
      const current = Application.nativeApplicationVersion || '0.0.0';
      const needsUpdate = compareVersions(current, min_version);
      if (needsUpdate && force_update) {
        setStatus('update_required');
        setLatestVersion(latest_version);
        setDownloadUrl(download_url);
        setChangelog(cl);
      } else {
        setStatus('ok');
      }
    } catch {
      setStatus('network_error');
    }
  };

  const onDownloadProgress = async (progress: number) => {
    setDownloadProgress(progress);
    try {
      await notifee.displayNotification({
        id: 'app-update',
        title: 'Downloading Update',
        body: `${progress}% downloaded`,
        android: {
          progress: {max: 100, current: progress, indeterminate: false},
          ongoing: true,
          smallIcon: 'ic_notification',
        },
      });
    } catch {}
  };

  const downloadAndInstall = async () => {
    if (downloaded) {
      openInstall();
      return;
    }

    setStatus('downloading');
    setDownloadProgress(0);

    try {
      await notifee.displayNotification({
        id: 'app-update',
        title: 'Downloading Update',
        body: 'Starting download...',
        android: {
          progress: {max: 100, current: 0, indeterminate: true},
          ongoing: true,
          smallIcon: 'ic_notification',
        },
      });
    } catch {}

    try {
      const filePath = `${RNFS.CachesDirectoryPath}/cinebd-update.apk`;
      await RNFS.unlink(filePath).catch(() => {});

      const result = await RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: filePath,
        progressInterval: 300,
        progressDivider: 1,
        begin: () => setDownloadProgress(0),
        progress: (res) => {
          if (res.contentLength > 0) {
            const pct = Math.round((res.bytesWritten / res.contentLength) * 100);
            setDownloadProgress(pct);
            onDownloadProgress(pct);
          }
        },
      }).promise;

      if (result.statusCode === 200) {
        setDownloaded(true);
        setDownloadProgress(100);
        try {
          await notifee.displayNotification({
            id: 'app-update',
            title: 'Update Ready',
            body: 'Tap to install the update',
            android: {
              ongoing: false,
              smallIcon: 'ic_notification',
            },
          });
        } catch {}
        openInstall();
      } else {
        setStatus('update_required');
        Linking.openURL(downloadUrl);
      }
    } catch {
      setStatus('update_required');
      Linking.openURL(downloadUrl);
    }
  };

  const openInstall = async () => {
    try {
      const filePath = `${RNFS.CachesDirectoryPath}/cinebd-update.apk`;
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await Linking.openURL(`file://${filePath}`);
      } else {
        Linking.openURL(downloadUrl);
      }
    } catch {
      Linking.openURL(downloadUrl);
    }
  };

  const blockMessage = reason || 'A new version is required to use this app. Please update to continue.';

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      {(status === 'kill_blocked' || status === 'update_required' || status === 'network_error') && (
        <>
          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.subtitle}>{blockMessage}</Text>

          {status === 'network_error' ? (
            <TouchableOpacity style={styles.btn} onPress={checkVersion} activeOpacity={0.8}>
              <Text style={styles.btnText}>Retry</Text>
            </TouchableOpacity>
          ) : (
            <>
              {changelog ? (
                <View style={styles.changelogBox}>
                  <Text style={styles.changelogTitle}>What's New:</Text>
                  <Text style={styles.changelogText}>{changelog}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={styles.btn} onPress={downloadAndInstall} activeOpacity={0.8}>
                <Text style={styles.btnText}>
                  {downloaded ? 'Install Update' : 'Download & Install'}
                </Text>
              </TouchableOpacity>

              {!downloaded && (
                <TouchableOpacity style={styles.fallbackBtn} onPress={() => Linking.openURL(downloadUrl || 'https://cinepix.top/app')} activeOpacity={0.8}>
                  <Text style={styles.fallbackBtnText}>Open in Browser</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      )}

      {status === 'checking' && (
        <>
          <ActivityIndicator size="large" color="#e11d48" />
          <Text style={styles.checkingText}>Checking for updates...</Text>
        </>
      )}

      {status === 'downloading' && (
        <>
          <Text style={styles.title}>Downloading Update</Text>
          <Text style={styles.subtitle}>Please wait, do not close the app</Text>
          <View style={styles.progressBox}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, {width: `${downloadProgress}%`}]} />
            </View>
            <Text style={styles.progressText}>{downloadProgress}%</Text>
          </View>
        </>
      )}

      {status === 'ok' && null}
    </View>
  );
}

function compareVersions(local: string, min: string): boolean {
  const l = local.split('.').map(Number);
  const m = min.split('.').map(Number);
  if (l[0] > m[0]) return false;
  if (l[0] < m[0]) return true;
  if (l[1] > m[1]) return false;
  if (l[1] < m[1]) return true;
  return l[2] < m[2];
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 32},
  logo: {width: 140, height: 140, marginBottom: 24},
  title: {fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8, textAlign: 'center'},
  subtitle: {fontSize: 15, color: '#999', textAlign: 'center', marginBottom: 24, lineHeight: 22},
  changelogBox: {width: '100%', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 24},
  changelogTitle: {fontSize: 13, fontWeight: '700', color: '#e11d48', marginBottom: 8},
  changelogText: {fontSize: 13, color: '#ccc', lineHeight: 20},
  btn: {backgroundColor: '#e11d48', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', alignItems: 'center'},
  btnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  fallbackBtn: {marginTop: 12, paddingVertical: 10, paddingHorizontal: 20},
  fallbackBtnText: {color: '#666', fontSize: 13, textDecorationLine: 'underline'},
  progressBox: {width: '100%', maxWidth: 280, alignItems: 'center'},
  progressBar: {width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden'},
  progressFill: {height: '100%', backgroundColor: '#e11d48', borderRadius: 3},
  progressText: {color: '#999', marginTop: 10, fontSize: 13},
  checkingText: {color: '#999', marginTop: 12, fontSize: 14},
});
