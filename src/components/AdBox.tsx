import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, InteractionManager, Platform, StyleSheet, View} from 'react-native';
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
  /**
   * Click-through policy (2026-09-30):
   *  - undefined (default): FULLY INERT — legacy behaviour for the general
   *    (non-18+) placements. Every top-frame navigation is cancelled.
   *  - true: SAFE CLICK-THROUGH — a USER TAP on the creative may open its
   *    top-frame target via onSelectTarget (rendered by the parent, usually
   *    the in-app SponsoredBrowser sheet). Auto-redirects and any navigation
   *    in the first CLICK_GRACE_MS after mount stay cancelled (the creative
   *    is still initialising then), so the box can never hijack the app.
   */
  clickable?: boolean;
  /** Called with the tapped target URL when clickable && user-initiated. */
  onSelectTarget?: (url: string) => void;
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

/**
 * After mount, the creative needs a moment for its own bootstrap (impression
 * pixels, iframe hydration). Navigations in this window are treated as
 * AUTO-REDIRECTS and cancelled even in clickable mode — only a genuine user
 * tap afterwards may leave the box.
 */
const CLICK_GRACE_MS = 2500;

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
 * Sandboxed ad box with a policy switch.
 *
 * Default (clickable=false): renders the creative and counts the impression
 * — nothing else. EVERY top-frame navigation other than the initial creative
 * load (about:/data:/blob:/nested iframes) is CANCELLED. Taps do nothing, no
 * redirect chain ever reaches the WebView or the browser.
 *
 * clickable=true: additionally lets a USER-initiated top-frame navigation
 * escape to the parent through onSelectTarget — the parent opens it in the
 * in-app SponsoredBrowser sheet (never the external browser). Distinguishing
 * taps from auto-redirects on Android WebView is unreliable, so the gate is
 * conservative:
 *  - the first CLICK_GRACE_MS after mount: everything cancelled (creative
 *    bootstrap = auto-redirect territory),
 *  - after that, the FIRST top-frame navigation is treated as a tap and
 *    handed to onSelectTarget (the creative only navigates its top frame on
 *    user click in practice),
 *  - subsequent top-frame navigations are cancelled (one shot per mount —
 *    keeps redirect chains and timers from ever looping),
 *  - intent://, market:// and any non-http(s) scheme: always cancelled,
 *  - iframe content (isTopFrame === false): always allowed inside the box.
 *
 * SEMANTICS (verified against RNCWebViewModuleImpl.java:208 —
 * `shouldStart ? DO_NOT_OVERRIDE : SHOULD_OVERRIDE`):
 *  - return true  → WebView LOADS the URL itself. Used for the initial
 *    creative, about:/data:/blob: and iframe content.
 *  - return false → navigation CANCELLED. This is the only safe answer for
 *    everything else: intent://, market:// or any custom scheme loaded by
 *    the WebView gets dispatched to Chrome/Play Store.
 *  - setSupportMultipleWindows={false} turns target="_blank"/window.open()
 *    into normal gated navigations instead of Android handing them to Chrome.
 *  - onOpenWindow is a no-op safety net for any remaining popup path.
 */
const AdBox: React.FC<AdBoxProps> = ({content, height, minHeight = 100, clickable = false, onSelectTarget}) => {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const mountedAtRef = useRef(0);
  const clickUsedRef = useRef(false);

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

    // HTML creatives: the wrapper document itself (no real URL).
    if (!isHttpUrl(content) && reqUrl.startsWith('file://')) {
      return true;
    }

    // From here on: top-frame navigations that would LEAVE the creative.
    if (!clickable || !onSelectTarget) {
      // Legacy inert policy — nothing external, ever.
      return false;
    }

    // Dangerous/custom schemes never escape, even on a tap.
    if (!/^https?:\/\//i.test(reqUrl)) {
      return false;
    }

    // Creative bootstrap window = auto-redirect territory. Cancelled even
    // in clickable mode so a timer-driven hijack can never pose as a tap.
    if (mountedAtRef.current && Date.now() - mountedAtRef.current < CLICK_GRACE_MS) {
      return false;
    }

    // One shot per mount: the first post-grace top-frame navigation is the
    // user's click; chains/retries after it stay cancelled.
    if (!clickUsedRef.current) {
      clickUsedRef.current = true;
      onSelectTarget(reqUrl);
      return false; // we render it in the in-app browser sheet instead
    }

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
        onLoad={() => {
          if (!mountedAtRef.current) {
            mountedAtRef.current = Date.now();
          }
          setLoading(false);
        }}
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

export default AdBox;
