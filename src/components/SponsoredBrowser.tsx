import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  Linking,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {WebView} from 'react-native-webview';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

/**
 * In-app browser sheet for ad click-throughs ("Sponsored").
 *
 * Opens INSIDE the app — the user never leaves, and Android's back button /
 * gesture returns them to the exact screen they were on (the WebView runs in
 * a stack-level Modal so the native back handling is deterministic).
 *
 * Scope: only the 18+ ad placements use it today (passed via Home's
 * adTarget state); other AdBoxes stay inert.
 *
 * Safety model (agreed 2026-09-30):
 *  - everything EXCEPT real http(s) pages (intent://, market://, file://,
 *    about:*, non-web schemes) is refused; the UI says why instead of
 *    silently dying,
 *  - the network can be broken → the visible Reload button is the recovery
 *    path,
 *  - the host page can be nasty → Open in browser escapes the sheet, the
 *    sheet itself never leaves the app,
 *  - hardware back on Android pops pages like a real browser, then the
 *    sheet; it can NEVER deep-launch the app's other screens.
 */

const WARN_HOSTS = [
  'adult',
  'porn',
  'xxx',
  'sex',
  '18+',
  'kamukta',
  'banglachoti',
  'desidude',
  'desitales',
  'xmishti',
  'mms',
];

const looksAdult = (url: string): boolean => {
  const u = url.toLowerCase();
  return WARN_HOSTS.some(h => u.includes(h));
};

const SponsorBrowser: React.FC<{
  url: string | null;
  onClose: () => void;
}> = ({url, onClose}) => {
  const open = !!url;
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [progress, setProgress] = useState(0);
  const webRef = useRef<WebView>(null);
  const slide = useRef(new Animated.Value(0)).current;

  // Mount/unmount animation: slide the sheet up over the app.
  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  // Android hardware back: pop WebView history first, sheet second. The
  // handler is registered only while the sheet is open, so it can never
  // swallow backs meant for the app after close.
  useEffect(() => {
    if (!open || Platform.OS !== 'android') {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, canGoBack, onClose]);

  // Reset per-open state.
  useEffect(() => {
    if (open) {
      setErrored(false);
      setCanGoBack(false);
      setLoading(true);
    }
  }, [open, url]);

  const host = (() => {
    try {
      return url ? new URL(url).hostname : '';
    } catch {
      return '';
    }
  })();
  const adultWarn = url ? looksAdult(url) : false;

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={st.backdrop} pointerEvents="box-none">
        <Animated.View
          style={[
            st.sheet,
            {
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [600, 0],
                  }),
                },
              ],
            },
          ]}>
          {/* Header */}
          <View style={st.header}>
            <View style={st.handleWrap}>
              <View style={st.handle} />
            </View>
            <View style={st.headerRow}>
              <View style={st.badge}>
                <MaterialCommunityIcons name="gift-outline" size={13} color="#f9a8d4" />
                <Text style={st.badgeTxt}>Sponsored</Text>
              </View>
              <Text style={st.hostTxt} numberOfLines={1}>
                {host}
              </Text>
              <View style={{flex: 1}} />
              {loading ? (
                <ActivityIndicator size="small" color="#f472b6" style={st.hbtn} />
              ) : (
                <Pressable
                  style={st.hbtn}
                  onPress={() => {
                    setErrored(false);
                    if (webRef.current && url) {
                      webRef.current.reload();
                    }
                  }}>
                  <MaterialCommunityIcons name="refresh" size={20} color="#cbd5e1" />
                </Pressable>
              )}
              <Pressable
                style={st.hbtn}
                onPress={() => {
                  if (url) {
                    Linking.openURL(url).catch(() => {});
                  }
                }}>
                <MaterialCommunityIcons name="open-in-new" size={18} color="#cbd5e1" />
              </Pressable>
              <Pressable style={st.closeBtn} onPress={onClose} accessibilityLabel="বিজ্ঞাপন বন্ধ করুন">
                <MaterialCommunityIcons name="close" size={18} color="#FFF" />
              </Pressable>
            </View>
            {adultWarn ? (
              <View style={st.warnRow}>
                <MaterialCommunityIcons name="alert-outline" size={12} color="#fbbf24" />
                <Text style={st.warnTxt}>18+ — স্পন্সর কনটেন্ট, সতর্ক থাকুন</Text>
              </View>
            ) : null}
          </View>

          {/* Progress bar */}
          <View style={st.progressTrack} pointerEvents="none">
            <View style={[st.progressBar, {width: `${Math.round(progress * 100)}%`}]} />
          </View>

          {/* Page */}
          <View style={st.pageWrap}>
            {url ? (
              <WebView
                ref={webRef}
                source={{uri: url}}
                style={st.webview}
                onLoadStart={() => {
                  setLoading(true);
                  setErrored(false);
                }}
                onLoadEnd={() => setLoading(false)}
                onLoadProgress={({nativeEvent}) => setProgress(nativeEvent.progress)}
                onNavigationStateChange={state => {
                  setCanGoBack(state.canGoBack);
                  // Any custom scheme inside the page (intent://, deep
                  // links of other apps) is refused with a visible message.
                  if (!/^https?:/i.test(state.url)) {
                    setErrored(true);
                    webRef.current?.stopLoading();
                  }
                }}
                onError={() => setErrored(true)}
                onRenderProcessGone={() => setErrored(true)}
                onShouldStartLoadWithRequest={req => /^https?:/i.test(req.url)}
                setSupportMultipleWindows={false}
                onOpenWindow={() => {}}
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState
                allowsBackForwardNavigationGestures
                pullToRefreshEnabled={false}
              />
            ) : null}
            {errored ? (
              <View style={st.errWrap}>
                <MaterialCommunityIcons name="web-off" size={40} color="#64748b" />
                <Text style={st.errTitle}>পেজটি খোলা গেল না</Text>
                <Text style={st.errBody}>
                  লিংকটি এই অ্যাপের ভেতরে সাপোর্টেড নয় — ব্রাউজারে খুলতে উপরের ↗ আইকনে চাপুন।
                </Text>
                <Pressable
                  style={st.errBtn}
                  onPress={() => {
                    setErrored(false);
                    if (url) {
                      webRef.current?.reload();
                    }
                  }}>
                  <Text style={st.errBtnTxt}>আবার চেষ্টা করুন</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end'},
  sheet: {
    height: '92%',
    backgroundColor: '#101319',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#171b24',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingTop: 6,
  },
  handleWrap: {alignItems: 'center', paddingBottom: 4},
  handle: {width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)'},
  headerRow: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingBottom: 8, gap: 6},
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(236,72,153,0.14)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeTxt: {color: '#f9a8d4', fontSize: 11, fontWeight: '700'},
  hostTxt: {color: '#94a3b8', fontSize: 12, flexShrink: 1, maxWidth: '42%'},
  hbtn: {padding: 6, borderRadius: 8},
  closeBtn: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  warnTxt: {color: '#fbbf24', fontSize: 11},
  progressTrack: {height: 2, backgroundColor: 'rgba(255,255,255,0.05)'},
  progressBar: {height: 2, backgroundColor: '#f472b6'},
  pageWrap: {flex: 1, position: 'relative'},
  webview: {flex: 1, backgroundColor: '#101319'},
  errWrap: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#101319',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  errTitle: {color: '#e2e8f0', fontSize: 16, fontWeight: '700'},
  errBody: {color: '#94a3b8', fontSize: 12, textAlign: 'center', lineHeight: 18},
  errBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(236,72,153,0.16)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  errBtnTxt: {color: '#f9a8d4', fontWeight: '700', fontSize: 13},
});

export default SponsorBrowser;
