import React, {useEffect, useState, useRef} from 'react';
import {View, StyleSheet, Linking, ActivityIndicator, Image, Text, TouchableOpacity, BackHandler} from 'react-native';
import * as Application from 'expo-application';
import axios from 'axios';
import * as RNFS from '@dr.pogodin/react-native-fs';
import notifee from '@notifee/react-native';

const API = 'https://cinepix.top/api/app';
const DOWNLOAD_URL_FALLBACK = 'https://cinepix.top/app';

interface Props {
  killSwitchBlocked?: boolean;
  reason?: string;
}

type ScreenStatus = 'kill_blocked' | 'checking' | 'update_required' | 'ok' | 'network_error' | 'downloading';

export default function ForceUpdateScreen({killSwitchBlocked, reason}: Props) {
  const [status, setStatus] = useState<ScreenStatus>(killSwitchBlocked ? 'checking' : 'checking');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [changelog, setChangelog] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const lastNotifRef = useRef(0);

  useEffect(() => {
    fetchUpdateInfo();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const fetchUpdateInfo = async () => {
    try {
      const res = await axios.get(`${API}/versioncheck`, {timeout: 10000});
      const {download_url, changelog: cl} = res.data;
      setDownloadUrl(download_url || DOWNLOAD_URL_FALLBACK);
      setChangelog(cl || '');
      if (killSwitchBlocked) {
        setStatus('kill_blocked');
      } else {
        const {min_version, force_update} = res.data;
        const current = Application.nativeApplicationVersion || '0.0.0';
        if (compareVersions(current, min_version) && force_update) {
          setStatus('update_required');
        } else {
          setStatus('ok');
        }
      }
    } catch {
      setDownloadUrl(DOWNLOAD_URL_FALLBACK);
      if (killSwitchBlocked) {
        setStatus('kill_blocked');
      } else {
        setStatus('network_error');
      }
    }
  };

  const updateNotification = async (progress: number) => {
    const now = Date.now();
    if (now - lastNotifRef.current < 1000) return;
    lastNotifRef.current = now;
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
    const url = downloadUrl || DOWNLOAD_URL_FALLBACK;

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
        fromUrl: url,
        toFile: filePath,
        progressInterval: 500,
        progressDivider: 1,
        begin: () => setDownloadProgress(0),
        progress: (res) => {
          if (res.contentLength > 0) {
            const pct = Math.round((res.bytesWritten / res.contentLength) * 100);
            setDownloadProgress(pct);
            updateNotification(pct);
          }
        },
      }).promise;

      if (result.statusCode === 200) {
        setDownloaded(true);
        setDownloadProgress(100);
        try {
          await notifee.cancelNotification('app-update');
          await notifee.displayNotification({
            id: 'app-update',
            title: 'Update Ready',
            body: 'Tap to install the update',
            android: {smallIcon: 'ic_notification'},
          });
        } catch {}
        openInstall();
      } else {
        setStatus(killSwitchBlocked ? 'kill_blocked' : 'update_required');
        Linking.openURL(url);
      }
    } catch {
      setStatus(killSwitchBlocked ? 'kill_blocked' : 'update_required');
      Linking.openURL(url);
    }
  };

  const openInstall = async () => {
    try {
      const filePath = `${RNFS.CachesDirectoryPath}/cinebd-update.apk`;
      const exists = await RNFS.exists(filePath);
      if (exists) {
        await Linking.openURL(`file://${filePath}`);
      } else {
        Linking.openURL(downloadUrl || DOWNLOAD_URL_FALLBACK);
      }
    } catch {
      Linking.openURL(downloadUrl || DOWNLOAD_URL_FALLBACK);
    }
  };

  const blockMessage = reason || 'A new version is required to use this app. Please update to continue.';

  if (status === 'ok') return null;

  if (status === 'checking') {
    return (
      <View style={styles.container}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <ActivityIndicator size="large" color="#e11d48" />
        <Text style={styles.checkingText}>Checking for updates...</Text>
      </View>
    );
  }

  if (status === 'downloading') {
    return (
      <View style={styles.container}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Downloading Update</Text>
        <Text style={styles.subtitle}>Please wait, do not close the app</Text>
        <View style={styles.progressBox}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {width: `${downloadProgress}%`}]} />
          </View>
          <Text style={styles.progressText}>{downloadProgress}%</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Update Required</Text>
      <Text style={styles.subtitle}>{status === 'network_error' ? 'Unable to check for updates. Please connect to the internet.' : blockMessage}</Text>

      {changelog ? (
        <View style={styles.changelogBox}>
          <Text style={styles.changelogTitle}>What's New:</Text>
          <Text style={styles.changelogText}>{changelog}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.btn} onPress={downloadAndInstall} activeOpacity={0.8}>
        <Text style={styles.btnText}>{downloaded ? 'Install Update' : 'Download & Install'}</Text>
      </TouchableOpacity>

      {!downloaded && (
        <TouchableOpacity style={styles.fallbackBtn} onPress={() => Linking.openURL(downloadUrl || DOWNLOAD_URL_FALLBACK)} activeOpacity={0.8}>
          <Text style={styles.fallbackBtnText}>Open in Browser</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function compareVersions(local: string, min: string): boolean {
  if (!local || !min) return false;
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
