import React, {useCallback, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Linking, StyleSheet, View} from 'react-native';
import {WebView, type ShouldStartLoadRequest} from 'react-native-webview';

interface AdBoxProps {
  /** Ad content: an http(s) URL to load, or a raw creative HTML string. */
  content: string;
  /** Fixed height for the box. */
  height?: number;
  /** Minimum height when no fixed height is wanted (Info screen boxes). */
  minHeight?: number;
}

/**
 * How long after a user touch a navigation is considered a click-through.
 * Ad creatives fire client-side redirects on their own (impression/refresh
 * chains); those arrive with no recent touch and must stay inside the box.
 */
const TAP_WINDOW_MS = 2000;

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

/**
 * Sandboxed ad box.
 *
 * Rules (top-frame navigations):
 *  - initial creative load / about:/data:/blob: → load inside the WebView
 *  - navigation within TAP_WINDOW_MS of a real touch → open in the system
 *    browser (this is the user's click) and keep the ad in place
 *  - everything else (auto-redirects with no touch) → blocked
 *
 * setSupportMultipleWindows={false} is critical: with it, target="_blank" /
 * window.open() from the creative becomes a normal in-WebView navigation
 * that flows through this gate. With multiple windows enabled Android hands
 * those straight to Chrome, bypassing the gate entirely (the app would open
 * the browser by itself on entry).
 */
const AdBox: React.FC<AdBoxProps> = ({content, height, minHeight = 100}) => {
  const [loading, setLoading] = useState(true);
  const lastTouchAtRef = useRef(0);
  const openedUrlRef = useRef('');
  const openedAtRef = useRef(0);

  const boxStyle = height != null ? {height} : {minHeight};

  const source = useMemo(() => {
    if (!content) return null;
    if (isHttpUrl(content)) return {uri: content};
    return {
      html:
        `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `</head><body style="margin:0;padding:0;background:#0a0a0a;display:flex;` +
        `align-items:center;justify-content:center;min-height:${minHeight}px;">` +
        `${content}</body></html>`,
    };
  }, [content, minHeight]);

  const onTouchStart = useCallback(() => {
    lastTouchAtRef.current = Date.now();
  }, []);

  const shouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest) => {
      const reqUrl: string = request.url || '';

      if (
        reqUrl.startsWith('about:') ||
        reqUrl.startsWith('data:') ||
        reqUrl.startsWith('blob:')
      ) {
        return true;
      }

      // Content loading inside nested ad iframes never leaves the box.
      if (request.isTopFrame === false) {
        return true;
      }

      // The creative itself.
      if (content && reqUrl === content) {
        return true;
      }

      const touchedRecently = Date.now() - lastTouchAtRef.current <= TAP_WINDOW_MS;
      if (!touchedRecently) {
        // Auto redirect fired by the creative with no user interaction:
        // keep it out of both the WebView and the browser.
        return false;
      }

      // A real click just happened → hand the destination to the browser.
      if (isHttpUrl(reqUrl)) {
        const now = Date.now();
        const alreadyOpened =
          openedUrlRef.current === reqUrl && now - openedAtRef.current < 1500;
        if (!alreadyOpened) {
          openedUrlRef.current = reqUrl;
          openedAtRef.current = now;
          Linking.openURL(reqUrl).catch(() => {});
        }
      }
      return false;
    },
    [content],
  );

  if (!content || !source) return null;

  return (
    <View style={[styles.container, boxStyle]}>
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="small" color="#333" />
        </View>
      )}
      <WebView
        source={source}
        style={[styles.webview, {minHeight: minHeight ?? height}]}
        onLoad={() => setLoading(false)}
        onError={() => setLoading(false)}
        onHttpError={() => setLoading(false)}
        onTouchStart={onTouchStart}
        onShouldStartLoadWithRequest={shouldStartLoad}
        setSupportMultipleWindows={false}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  webview: {
    width: '100%',
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
});

export default React.memo(AdBox);
