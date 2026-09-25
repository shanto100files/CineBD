import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useAuthStore} from '../lib/zustand/authStore';
import {useM3Colors} from '../theme/M3PaletteContext';

/**
 * Fresh login experience:
 * - Glow-blob background (matches the website's bg-glow aesthetic)
 * - Icon-led filled inputs with password visibility toggle
 * - On success: brief success flash, then automatic return to the page the
 *   user came from. Only if going back is impossible does the success popup
 *   with an explicit Back button appear.
 */
export default function LoginScreen({navigation}: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Success states: flash overlay auto-returns; popup is the fallback.
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const [showCelebrate, setShowCelebrate] = useState(false);
  const [celebrateName, setCelebrateName] = useState('');

  const login = useAuthStore(s => s.login);
  const colors = useM3Colors();

  const flashScale = useRef(new Animated.Value(0.6)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const autoBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoBackTimer.current) {
        clearTimeout(autoBackTimer.current);
      }
    };
  }, []);

  const shakeError = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, {toValue: 8, duration: 60, useNativeDriver: true}),
      Animated.timing(shakeX, {toValue: -8, duration: 60, useNativeDriver: true}),
      Animated.timing(shakeX, {toValue: 5, duration: 50, useNativeDriver: true}),
      Animated.timing(shakeX, {toValue: -5, duration: 50, useNativeDriver: true}),
      Animated.timing(shakeX, {toValue: 0, duration: 40, useNativeDriver: true}),
    ]).start();
  };

  const returnToPreviousPage = () => {
    if (navigation.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Nothing to go back to (deep link / relaunch): keep the popup open so
      // the user can leave with its Back button.
      setCelebrateName(username.trim());
      setShowSuccessFlash(false);
      setShowCelebrate(true);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError('Username ও password দিন');
      shakeError();
      return;
    }
    setLoading(true);
    setError('');
    const result = await login(username.trim(), password);
    setLoading(false);
    if (result.success) {
      setCelebrateName(username.trim());
      setShowSuccessFlash(true);
      flashOpacity.setValue(0);
      flashScale.setValue(0.6);
      Animated.parallel([
        Animated.timing(flashScale, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(flashOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      // Auto-return to the previous page shortly after the success flash.
      autoBackTimer.current = setTimeout(returnToPreviousPage, 1100);
    } else {
      setError(result.error || 'লগইন ব্যর্থ হয়েছে');
      shakeError();
    }
  };

  return (
    <View style={[styles.root, {backgroundColor: colors.background}]}>
      {/* Decorative glow blobs (website-style bg glow) */}
      <View pointerEvents="none" style={styles.glowLayer}>
        <View
          style={[
            styles.glowA,
            {backgroundColor: colors.primary, opacity: 0.16},
          ]}
        />
        <View
          style={[
            styles.glowB,
            {backgroundColor: colors.tertiary, opacity: 0.12},
          ]}
        />
      </View>

      <KeyboardAvoidingView
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Brand */}
          <View style={styles.brandWrap}>
            <View
              style={[
                styles.logoRing,
                {borderColor: colors.primary, shadowColor: colors.primary},
              ]}>
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={[styles.title, {color: colors.onBackground}]}>
              আবার স্বাগতম
            </Text>
            <Text
              style={[styles.subtitle, {color: colors.onSurfaceVariant}]}>
              সিনেমা ও সিরিজের জগতে ফিরে আসুন
            </Text>
          </View>

          {/* Error */}
          {error ? (
            <Animated.View
              style={[
                styles.errorBox,
                {backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.28)', transform: [{translateX: shakeX}]},
              ]}>
              <Ionicons name="alert-circle" size={16} color="#ef4444" />
              <Text style={styles.errorText}>{error}</Text>
            </Animated.View>
          ) : null}

          {/* Username */}
          <View
            style={[
              styles.inputWrap,
              {backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outline},
            ]}>
            <Ionicons
              name="person-outline"
              size={18}
              color={colors.onSurfaceVariant}
            />
            <TextInput
              style={[styles.input, {color: colors.onSurface}]}
              placeholder="Username"
              placeholderTextColor={colors.onSurfaceVariant}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <View
            style={[
              styles.inputWrap,
              {backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outline},
            ]}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={colors.onSurfaceVariant}
            />
            <TextInput
              style={[styles.input, {color: colors.onSurface}]}
              placeholder="Password"
              placeholderTextColor={colors.onSurfaceVariant}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={19}
                color={colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          </View>

          {/* Login button */}
          <TouchableOpacity
            style={[styles.loginBtn, {backgroundColor: colors.primary, shadowColor: colors.primary}]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}>
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={19} color={colors.onPrimary} />
                <Text style={[styles.loginBtnText, {color: colors.onPrimary}]}>
                  লগইন করুন
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Register */}
          <TouchableOpacity
            style={[
              styles.registerBtn,
              {borderColor: colors.outline, backgroundColor: 'transparent'},
            ]}
            onPress={() => navigation.navigate('Register')}>
            <Ionicons name="person-add-outline" size={17} color={colors.primary} />
            <Text style={[styles.registerBtnText, {color: colors.primary}]}>
              অ্যাকাউন্ট নেই? রেজিস্টার করুন
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Success flash: auto-returns to the previous page */}
      <Modal
        visible={showSuccessFlash}
        transparent
        animationType="none"
        onRequestClose={() => {}}>
        <View style={styles.flashBackdrop}>
          <Animated.View
            style={[
              styles.flashCard,
              {
                backgroundColor: colors.surfaceContainerHigh,
                opacity: flashOpacity,
                transform: [{scale: flashScale}],
              },
            ]}>
            <View
              style={[
                styles.flashCheck,
                {backgroundColor: colors.primaryContainer},
              ]}>
              <Ionicons name="checkmark" size={34} color={colors.primary} />
            </View>
            <Text style={[styles.flashTitle, {color: colors.onSurface}]}>
              লগইন সফল!
            </Text>
            <Text style={[styles.flashSub, {color: colors.onSurfaceVariant}]}>
              {celebrateName ? `${celebrateName}, ` : ''}ফিরে যাচ্ছি...
            </Text>
          </Animated.View>
        </View>
      </Modal>

      {/* Fallback popup: only when there is no page to go back to */}
      <Modal
        visible={showCelebrate}
        transparent
        animationType="fade"
        onRequestClose={() => {}}>
        <View style={styles.flashBackdrop}>
          <View
            style={[
              styles.celebrateCard,
              {backgroundColor: colors.surfaceContainerHigh},
            ]}>
            <Text style={{fontSize: 50}}>🎉</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={colors.primary}
              />
              <Text
                style={{color: colors.onSurface, fontSize: 20, fontWeight: '800'}}>
                Login Successful!
              </Text>
            </View>
            <Text
              style={{
                color: colors.onSurfaceVariant,
                fontSize: 14,
                textAlign: 'center',
              }}>
              স্বাগতম{celebrateName ? `, ${celebrateName}` : ''}! আপনি সফলভাবে
              লগইন করেছেন।
            </Text>
            <TouchableOpacity
              style={[styles.celebrateBtn, {backgroundColor: colors.primary}]}
              onPress={() => {
                setShowCelebrate(false);
                if (navigation.canGoBack && navigation.canGoBack()) {
                  navigation.goBack();
                }
              }}>
              <Ionicons name="arrow-back" size={18} color={colors.onPrimary} />
              <Text
                style={{color: colors.onPrimary, fontSize: 15, fontWeight: '700'}}>
                Back
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  glowLayer: {...StyleSheet.absoluteFillObject, overflow: 'hidden'},
  glowA: {
    position: 'absolute',
    top: -140,
    right: -110,
    width: 340,
    height: 340,
    borderRadius: 170,
  },
  glowB: {
    position: 'absolute',
    bottom: -160,
    left: -120,
    width: 380,
    height: 380,
    borderRadius: 190,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
  },
  brandWrap: {alignItems: 'center', marginBottom: 30},
  logoRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 22,
    shadowOffset: {width: 0, height: 0},
    elevation: 12,
    marginBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  logoImage: {width: 84, height: 84},
  title: {fontSize: 27, fontWeight: '800'},
  subtitle: {fontSize: 14, marginTop: 5},
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  errorText: {color: '#ef4444', fontSize: 13, flex: 1},
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  input: {flex: 1, paddingVertical: 13, fontSize: 15},
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 8,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 4},
    elevation: 8,
  },
  loginBtnText: {fontSize: 16, fontWeight: '800'},
  registerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
  },
  registerBtnText: {fontSize: 14, fontWeight: '700'},
  flashBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  flashCard: {
    alignItems: 'center',
    borderRadius: 26,
    gap: 10,
    maxWidth: 320,
    padding: 26,
    width: '100%',
  },
  flashCheck: {
    alignItems: 'center',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  flashTitle: {fontSize: 19, fontWeight: '800'},
  flashSub: {fontSize: 13, textAlign: 'center'},
  celebrateCard: {
    alignItems: 'center',
    borderRadius: 28,
    gap: 10,
    maxWidth: 340,
    padding: 24,
    width: '100%',
  },
  celebrateBtn: {
    alignItems: 'center',
    borderRadius: 24,
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
});
