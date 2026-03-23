import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import WebView from '@metamask/react-native-webview';

import { Label } from '@/components/Label';
import { useNubleAuth } from '@/providers/NubleAuthProvider';
import type { NavigationProps } from '@/Routes';
import { useTheme } from '@/theme/themes';
import { navigationStyle } from '@/utils/navigationStyle';

import { NUBLE_CHAT_URL } from './chatConfig';

/**
 * ChatScreen — embeds the Nuble AI chat (ROKET-CHAT) inside a WebView.
 *
 * Authentication flow (mirrors the Vibe-Trading web app exactly):
 * 1. On mount, we call NubleAuthProvider.getChatToken() which:
 *    a. Gets the current platform access token (refreshing if needed).
 *    b. Calls POST /api/v1/auths/platform-exchange on the ROKET-CHAT
 *       backend — the EXACT same endpoint the Vibe-Trading platform uses.
 *    c. ROKET-CHAT validates the platform token via the internal API,
 *       syncs/creates the user (tenant-isolated: same user ID, chat history,
 *       memory, brokerage context), and returns a chat JWT.
 * 2. The chat JWT is injected into the WebView's localStorage before the
 *    SvelteKit app boots, so the frontend never shows login/signup.
 * 3. Injected CSS hides sidebar/nav for an immersive mobile experience.
 */
export const ChatScreen = ({}: NavigationProps<'Chat'>) => {
  const { colors } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [chatToken, setChatToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  const { getChatToken } = useNubleAuth();

  // Exchange platform token for chat token on mount
  useEffect(() => {
    let cancelled = false;
    setIsAuthenticating(true);

    getChatToken().then(token => {
      if (cancelled) {
        return;
      }
      setChatToken(token);
      setIsAuthenticating(false);
    });

    return () => {
      cancelled = true;
    };
  }, [getChatToken]);

  const handleLoadEnd = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setIsAuthenticating(true);
    setChatToken(null);
    getChatToken().then(token => {
      setChatToken(token);
      setIsAuthenticating(false);
    });
  }, [getChatToken]);

  /**
   * JS injected into the WebView BEFORE the page loads.
   * Sets the JWT in localStorage so the SvelteKit pre-auth script
   * finds it and skips the login/signup flow entirely.
   */
  const injectedJSBeforeLoad = chatToken
    ? `
    (function() {
      localStorage.setItem('token', '${chatToken}');
      localStorage.setItem('theme', 'dark');
      true;
    })();
  `
    : '';

  /**
   * JS injected AFTER page load:
   * - Theme alignment with wallet
   * - Hide sidebar/nav for mobile-native feel
   * - Disable overscroll
   */
  const injectedJSAfterLoad = `
    (function() {
      // Match wallet background
      document.documentElement.style.background = '#0d0a14';
      document.body.style.background = '#0d0a14';
      document.body.style.overscrollBehavior = 'none';

      // Hide sidebar + nav for immersive mobile chat
      var style = document.createElement('style');
      style.textContent = \`
        #sidebar { display: none !important; }
        #sidebar-button, button[aria-label="Toggle Sidebar"],
        button[aria-label="Open Sidebar"] { display: none !important; }
        #content { margin-left: 0 !important; }
        .max-w-full { max-width: 100% !important; }
        nav.sticky { display: none !important; }
        /* Hide login/signup if they somehow appear */
        a[href="/auth"], button:has(> span:contains("Sign")),
        .auth-form { display: none !important; }
      \`;
      document.head.appendChild(style);

      true;
    })();
  `;

  // Show loading while authenticating
  if (isAuthenticating) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} testID="ChatScreen">
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.kraken} />
          <Label type="regularBody" color="light50" style={styles.loadingText}>
            Connecting to Nuble Chat…
          </Label>
        </View>
      </View>
    );
  }

  if (hasError) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]} testID="ChatScreen">
        <View style={styles.errorContainer}>
          <Label type="boldTitle1" color="light100" style={styles.errorTitle}>
            Unable to connect
          </Label>
          <Label type="regularBody" color="light50" style={styles.errorSubtitle}>
            Make sure the Nuble Chat server is running at {NUBLE_CHAT_URL}
          </Label>
          <Label type="boldBody" color="kraken" style={styles.retryButton} onPress={handleRetry}>
            Tap to retry
          </Label>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} testID="ChatScreen">
      <WebView
        ref={webViewRef}
        source={{ uri: NUBLE_CHAT_URL }}
        style={styles.webView}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        allowsBackForwardNavigationGestures={false}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleError}
        injectedJavaScriptBeforeContentLoaded={injectedJSBeforeLoad}
        injectedJavaScript={injectedJSAfterLoad}
        originWhitelist={['*']}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        containerStyle={isLoading ? styles.hidden : undefined}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.kraken} />
          <Label type="regularBody" color="light50" style={styles.loadingText}>
            Loading Nuble Chat…
          </Label>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0d0a14',
  },
  hidden: {
    opacity: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d0a14',
  },
  loadingText: {
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});

ChatScreen.navigationOptions = navigationStyle({
  headerTransparent: true,
  title: '',
});
