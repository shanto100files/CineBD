import React, {useEffect, useState} from 'react';
import {View, StyleSheet, Linking, ActivityIndicator, Image, Platform, BackHandler} from 'react-native';
import AppText from '../components/ui/Text';
import axios from 'axios';
import * as Application from 'expo-application';
import * as RNFS from '@dr.pogodin/react-native-fs';

const API = 'https://cinepix.top/api/app';

interface Props {
  killSwitchBlocked?: boolean;
  reason?: string;
}

export default function ForceUpdateScreen({killSwitchBlocked, reason}: Props) {
  const [status, setStatus] = useState(killSwitchBlocked ? 'kill_blocked' : 'checking');
  const [latestVersion, setLatestVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [changelog, setChangelog] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!killSwitchBlocked) {
      checkVersion();
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const checkVersion = async () => {
    try {
      const res = await axios.get(`${API}/versioncheck`, {timeout: 8000});
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

  const downloadAndInstall = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const filePath = `${RNFS.CachesDirectoryPath}/cinebd-update.apk`;
      const result = await RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: filePath,
        progressInterval: 500,
        progressDivider: 1,
        begin: () => setDownloadProgress(0),
        progress: (res) => {
          if (res.contentLength > 0) {
            setDownloadProgress(Math.round((res.bytesWritten / res.contentLength) * 100));
          }
        },
      }).promise;
      if (result.statusCode === 200) {
        await RNFS.writeFile(filePath, '', 'utf8');
        Linking.openURL(`file://${filePath}`);
      }
    } catch {
      Linking.openURL(downloadUrl);
    }
    setDownloading(false);
  };

  if (status === 'kill_blocked') {
    return (
      <View style={styles.container}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <AppText role="headlineMedium" style={styles.title}>Update Required</AppText>
        <AppText role="bodyMedium" style={styles.subtitle}>
          {reason || 'A new version is required to use this app.'}
        </AppText>
        <View style={styles.btnRow}>
          <View style={[styles.btn, {backgroundColor: '#e11d48'}]}>
            <AppText role="labelLarge" style={styles.btnText} onPress={() => Linking.openURL('https://cinepix.top/app')}>
              Download App
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  if (status === 'checking') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#e11d48" />
        <AppText role="bodyMedium" style={styles.checkingText}>Checking for updates...</AppText>
      </View>
    );
  }

  if (status === 'ok') return null;

  if (status === 'network_error') {
    return (
      <View style={styles.container}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <AppText role="headlineMedium" style={styles.title}>Update Required</AppText>
        <AppText role="bodyMedium" style={styles.subtitle}>
          Unable to check for updates. Please connect to the internet and try again.
        </AppText>
        <View style={styles.btnRow}>
          <View style={[styles.btn, {backgroundColor: '#e11d48'}]}>
            <AppText role="labelLarge" style={styles.btnText} onPress={checkVersion}>
              Retry
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <AppText role="headlineMedium" style={styles.title}>Update Required</AppText>
      <AppText role="bodyMedium" style={styles.subtitle}>
        Please update to v{latestVersion} to continue
      </AppText>

      {changelog ? (
        <View style={styles.changelogBox}>
          <AppText role="labelMedium" style={styles.changelogTitle}>What's New:</AppText>
          <AppText role="bodySmall" style={styles.changelogText}>{changelog}</AppText>
        </View>
      ) : null}

      {downloading ? (
        <View style={styles.progressBox}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {width: `${downloadProgress}%`}]} />
          </View>
          <AppText role="bodySmall" style={styles.progressText}>{downloadProgress}%</AppText>
        </View>
      ) : (
        <View style={styles.btnRow}>
          <View style={[styles.btn, {backgroundColor: '#e11d48'}]}>
            <AppText role="labelLarge" style={styles.btnText} onPress={downloadAndInstall}>
              Update Now
            </AppText>
          </View>
        </View>
      )}
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
  logo: {width: 160, height: 160, marginBottom: 24},
  title: {fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 8},
  subtitle: {fontSize: 15, color: '#999', textAlign: 'center', marginBottom: 24},
  changelogBox: {width: '100%', backgroundColor: '#1a1a1a', borderRadius: 12, padding: 16, marginBottom: 24},
  changelogTitle: {fontSize: 13, fontWeight: '700', color: '#e11d48', marginBottom: 8},
  changelogText: {fontSize: 13, color: '#ccc', lineHeight: 20},
  btnRow: {flexDirection: 'row', gap: 12},
  btn: {paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12},
  btnText: {color: '#fff', fontWeight: '700', fontSize: 16},
  progressBox: {width: '100%', maxWidth: 280, alignItems: 'center'},
  progressBar: {width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden'},
  progressFill: {height: '100%', backgroundColor: '#e11d48', borderRadius: 3},
  progressText: {color: '#999', marginTop: 8, fontSize: 13},
  checkingText: {color: '#999', marginTop: 12, fontSize: 14},
});
