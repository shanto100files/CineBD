import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, InteractionManager, StyleSheet, View} from 'react-native';
import {WebView} from 'react-native-webview';
// Type lives in the subpath module: the package root only re-exports WebView.
type ShouldStartLoadRequest = import('react-native-webview/lib/WebViewTypes').ShouldStartLoadRequest;

interface AdBoxProps {
  /** Ad content: an http(s) URL to load, or a raw creative HTML string. */
  content: string;
  /** Fixed height for the box. */
  height?: number;
  /** Minimum height when no fixed height is wanted (Info screen boxes). */
  minHeight?: number;
}

/**
 * Delay before the ad WebView is allowed to mount.
 *
 * The native Android bridge answers shouldOverrideUrlLoading within 250ms or
 * DEFAULTS TO ALLOWING the navigation. During app startup the JS thread is
 * busy, so an ad creative firing an intent:// redirect right at mount could
 * slip past the gate through that timeout and open Chrome by itself. Waiting
 * until interactions settle (plus a grace period) means the gate always
 * answers in time and can cancel everything.
 */
const MOUNT_DELAY_MS = 3500;

// Belt-and-braces inside the creative page itself: no popups from JS.
const BLOCK_POPUPS_SCRIPT = 'window.open=function(){return null;};true;';

/**
 * Kill text selection in the creative document (and any SAME-origin iframe
 * it embeds). Selection on Android pops the native Copy/Select-all toolbar
 * and vibrates on every tap near it - the top complaint about ad boxes.
 * Runs via WebView.evaluateJavascript, so the page CSP does not apply.
 * Cross-origin iframes are unreachable from here; those are covered by the
 * #shield overlay served from ads-frame.php.
 */
const NO_SELECTION_SCRIPT = `
(function(){
  try {
    var css = '*{-webkit-user-select:none !important;user-select:none !important;-webkit-touch-callout:none !important;}';
    function harden(doc) {
      var st = doc.createElement('style');
      st.textContent = css;
      (doc.head || doc.documentElement).appendChild(st);
      doc.addEventListener('selectstart', function (e) { e.preventDefault(); });
      doc.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      doc.addEventListener('dblclick', function (e) { e.preventDefault(); });
      doc.addEventListener('selectionchange', function () {
        var s = doc.getSelection && doc.getSelection();
        if (s && !s.isCollapsed) { try { s.removeAllRanges(); } catch (e) {} }
      });
    }
    harden(document);
    var frames = document.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        var fd = frames[i].contentDocument;
        if (fd && fd.documentElement) { harden(fd); }
      } catch (e) {}
    }
  } catch (e) {}
  true;
})();
true;
`;

// Same rules baked into generated raw-HTML creatives (no JS needed there).
const NO_SELECTION_CSS =
  'html,body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}';

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

/**
 * Fully inert, sandboxed ad box.
 *
 * Policy: the box renders the creative and counts the impression — nothing
 * else. EVERY top-frame navigation other than the initial creative load
 * (about:/data:/blob:/nested iframes) is CANCELLED. Taps do nothing, no
 * redirect chain ever reaches the WebView or the browser.
 *
 * SEMANTICS (verified against RNCWebViewModuleImpl.java:208 —
 * `shouldStart ? DO_NOT_OVERRIDE : SHOULD_OVERRIDE`):
 *  - return true  → WebView LOADS the URL itself. Only safe for the initial
 *    creative, about:/data:/blob: and iframe content.
 *  - return false → navigation CANCELLED. This is the only safe answer for
 *    everything else: intent://, market:// or any custom scheme loaded by
 *    the WebView gets dispatched to Chrome/Play Store.
 *  - setSupportMultipleWindows={false} turns target="_blank"/window.open()
 *    into normal gated navigations instead of Android handing them to Chrome.
 *  - onOpenWindow is a no-op safety net for any remaining popup path.
 */
const AdBox: React.FC<AdBoxProps> = ({content, height, minHeight = 100}) => {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);

  // See MOUNT_DELAY_MS: mount only after the app goes idle plus a grace
  // period, so the native 250ms decision window is never missed.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interaction = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (!cancelled) {
          setActive(true);
        }
      }, MOUNT_DELAY_MS);
    });
    return () => {
      cancelled = true;
      interaction.cancel();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const boxStyle = height != null ? {height} : {minHeight};

  const source = useMemo(() => {
    if (!content) return null;
    if (isHttpUrl(content)) return {uri: content};
    return {
      html:
        `<html><head><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<style>${NO_SELECTION_CSS}</style>` +
        `</head><body style="margin:0;padding:0;background:#0a0a0a;display:flex;` +
        `align-items:center;justify-content:center;min-height:${minHeight}px;">` +
        `${content}</body></html>`,
    };
  }, [content, minHeight]);

  const shouldStartLoad = (request: ShouldStartLoadRequest) => {
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

    // Everything else — auto redirects, click targets, intent://, market://,
    // any scheme — is CANCELLED (false = do not load). Nothing external,
    // ever.
    return false;
  };

  if (!content || !source || !active) {
    return <View style={[styles.container, boxStyle]} />;
  }

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
        onShouldStartLoadWithRequest={shouldStartLoad}
        onOpenWindow={() => {
          // Safety net: never let the ad open a real window/browser.
        }}
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={BLOCK_POPUPS_SCRIPT}
        injectedJavaScript={NO_SELECTION_SCRIPT}
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
