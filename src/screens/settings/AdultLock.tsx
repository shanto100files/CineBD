import React, {useCallback, useEffect, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  ToastAndroid,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {settingsStorage} from '../../lib/storage';
import {
  ADULT_PIN_MAX,
  ADULT_PIN_MIN,
  clearAdultLock,
  hasBiometricHardware,
  isAdultPinSet,
  isBiometricEnabled,
  markUnlocked,
  promptBiometric,
  setAdultPin,
  setBiometricEnabled,
  verifyAdultPin,
} from '../../lib/adultLock';
import {showAppDialog} from '../../lib/zustand/appDialogStore';

/**
 * 18+ Lock screen.
 *
 * Modes (driven by route.params?.mode):
 *  - 'setup'    → first-time PIN enrolment (from Settings when enabling 18+)
 *  - 'unlock'   → verify PIN/biometric to open this session
 *  - 'settings' → manage the lock: change PIN, toggle biometrics, remove lock
 */
export default function AdultLockScreen() {
  const colors = useM3Colors();
  const navigation = useNavigation<any>();
  const mode: 'setup' | 'unlock' | 'settings' =
    (useNavigation().getState()?.routes?.slice(-1)?.[0] as any)?.params?.mode || 'unlock';

  const pinSet = isAdultPinSet();
  const [stage, setStage] = useState<'enter' | 'confirm'>(pinSet || mode !== 'setup' ? 'enter' : 'enter');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(isBiometricEnabled());

  const startMode = mode;
  useEffect(() => {
    hasBiometricHardware().then(setBioAvailable);
    // On unlock mode with biometrics enabled, fire the prompt immediately.
    if (startMode === 'unlock' && pinSet && isBiometricEnabled()) {
      (async () => {
        setBusy(true);
        const ok = await promptBiometric();
        setBusy(false);
        if (ok) {
          markUnlocked();
          navigation.goBack();
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPin = useCallback(
    async (entered: string) => {
      if (startMode === 'setup') {
        if (stage === 'enter') {
          if (!/^\d{4,8}$/.test(entered)) {
            ToastAndroid.show(`${ADULT_PIN_MIN}-${ADULT_PIN_MAX} ডিজিটের পিন দিন`, ToastAndroid.SHORT);
            setPin('');
            return;
          }
          setFirstPin(entered);
          setStage('confirm');
          setPin('');
          return;
        }
        // confirm stage
        if (entered !== firstPin) {
          ToastAndroid.show('পিন মিলছে না — আবার দিন', ToastAndroid.SHORT);
          setStage('enter');
          setFirstPin('');
          setPin('');
          return;
        }
        setBusy(true);
        const ok = await setAdultPin(entered);
        setBusy(false);
        if (!ok) {
          ToastAndroid.show('পিন সেভ করা যায়নি', ToastAndroid.SHORT);
          return;
        }
        markUnlocked();
        ToastAndroid.show('18+ লক সেট হয়েছে', ToastAndroid.SHORT);
        navigation.goBack();
        return;
      }

      // unlock / settings-verify
      setBusy(true);
      const ok = await verifyAdultPin(entered);
      setBusy(false);
      if (!ok) {
        ToastAndroid.show('ভুল পিন', ToastAndroid.SHORT);
        setPin('');
        return;
      }
      markUnlocked();
      navigation.goBack();
    },
    [startMode, stage, firstPin, navigation],
  );

  const pressDigit = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, ADULT_PIN_MAX);
    setPin(next);
    if (next.length >= ADULT_PIN_MIN && next.length === ADULT_PIN_MAX) {
      submitPin(next);
    }
  };

  const pressBackspace = () => setPin(p => p.slice(0, -1));

  const removeLock = () => {
    showAppDialog({
      title: '18+ লক সরাবেন?',
      message: 'পিন মুছে যাবে এবং 18+ শুধু এজ-গেট দিয়ে নিয়ন্ত্রিত হবে।',
      variant: 'warning',
      actions: [
        {label: 'না'},
        {
          label: 'সরাও',
          variant: 'destructive',
          onPress: () => {
            clearAdultLock();
            ToastAndroid.show('লক সরানো হয়েছে', ToastAndroid.SHORT);
            navigation.goBack();
          },
        },
      ],
    });
  };

  const title =
    startMode === 'setup'
      ? stage === 'enter'
        ? '18+ পিন সেট করুন'
        : 'পিন আবার দিন'
      : startMode === 'settings'
        ? '18+ লক সেটিংস'
        : '18+ আনলক করুন';

  // ---------------- settings mode ----------------
  if (startMode === 'settings' && pinSet) {
    return (
      <ScrollView style={{flex: 1, backgroundColor: colors.background}} contentContainerStyle={{padding: 20}}>
        <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, marginBottom: 14}}>
          18+ লক সেটিংস
        </AppText>

        <Pressable
          style={[st.row, {backgroundColor: colors.surfaceContainerHigh}]}
          onPress={() => navigation.push('AdultLock', {mode: 'setup'})}>
          <MaterialCommunityIcons name="lock-reset" size={22} color={colors.primary} />
          <AppText style={{flex: 1, marginLeft: 12, color: colors.onSurface}}>পিন পরিবর্তন করুন</AppText>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </Pressable>

        <View style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginTop: 10}]}>
          <MaterialCommunityIcons name="fingerprint" size={22} color={colors.primary} />
          <View style={{flex: 1, marginLeft: 12}}>
            <AppText style={{color: colors.onSurface}}>ফিঙ্গারপ্রিন্ট দিয়ে আনলক</AppText>
            {!bioAvailable && (
              <AppText style={{color: colors.onSurfaceVariant, fontSize: 11}}>
                এই ডিভাইসে বায়োমেট্রিক নেই
              </AppText>
            )}
          </View>
          <Switch
            value={bioOn}
            disabled={!bioAvailable}
            onValueChange={v => {
              setBiometricEnabled(v);
              setBioOn(v);
            }}
          />
        </View>

        <Pressable
          style={[st.row, {backgroundColor: colors.surfaceContainerHigh, marginTop: 10}]}
          onPress={removeLock}>
          <MaterialCommunityIcons name="lock-open-variant" size={22} color={colors.error} />
          <AppText style={{flex: 1, marginLeft: 12, color: colors.error}}>লক সরিয়ে ফেলুন</AppText>
        </Pressable>

        <AppText style={{color: colors.onSurfaceVariant, fontSize: 12, marginTop: 18, lineHeight: 18}}>
          পিন দিয়ে 18+ কনটেন্ট সুরক্ষিত থাকে। প্রতি ১৫ মিনিট পর আবার আনলক করতে হবে।
        </AppText>
      </ScrollView>
    );
  }

  // ---------------- pin pad (setup / unlock) ----------------
  return (
    <View style={[st.full, {backgroundColor: colors.background}]}>
      <AppText role="headlineSmallEmphasized" style={{color: colors.onSurface, textAlign: 'center', marginTop: 60}}>
        {title}
      </AppText>
      <AppText style={{color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, paddingHorizontal: 30}}>
        {startMode === 'setup'
          ? stage === 'enter'
            ? '৪-৮ ডিজিটের পিন দিন — এটা ছাড়া 18+ চালু হবে না'
            : 'আবার একই পিন দিন'
          : 'পিন দিন বা ফিঙ্গারপ্রিন্ট ব্যবহার করুন'}
      </AppText>

      {/* dots */}
      <View style={st.dotsRow}>
        {Array.from({length: Math.max(ADULT_PIN_MIN, pin.length || ADULT_PIN_MIN)}).map((_, i) => (
          <View
            key={i}
            style={[
              st.dot,
              {backgroundColor: i < pin.length ? colors.primary : colors.surfaceContainerHighest},
            ]}
          />
        ))}
      </View>

      {startMode === 'unlock' && pinSet && bioOn && bioAvailable && (
        <Pressable
          style={{alignItems: 'center', marginBottom: 8}}
          onPress={async () => {
            setBusy(true);
            const ok = await promptBiometric();
            setBusy(false);
            if (ok) {
              markUnlocked();
              navigation.goBack();
            }
          }}>
          <MaterialCommunityIcons name="fingerprint" size={40} color={colors.primary} />
          <AppText style={{color: colors.primary, fontSize: 12}}>ফিঙ্গারপ্রিন্ট</AppText>
        </Pressable>
      )}

      <View style={st.pad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <Pressable key={d} style={[st.key, {backgroundColor: colors.surfaceContainerHigh}]} onPress={() => pressDigit(d)}>
            <AppText style={st.keyTxt}>{d}</AppText>
          </Pressable>
        ))}
        <View style={st.key} />
        <Pressable style={[st.key, {backgroundColor: colors.surfaceContainerHigh}]} onPress={() => pressDigit('0')}>
          <AppText style={st.keyTxt}>0</AppText>
        </Pressable>
        <Pressable style={st.key} onPress={pressBackspace}>
          <MaterialCommunityIcons name="backspace-outline" size={26} color={colors.onSurface} />
        </Pressable>
      </View>

      {startMode === 'setup' && pin.length >= ADULT_PIN_MIN && (
        <Pressable style={st.doneBtn} onPress={() => submitPin(pin)}>
          <AppText style={{color: colors.primary, fontWeight: '700'}}>পরবর্তী</AppText>
        </Pressable>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  full: {flex: 1},
  dotsRow: {flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 30, marginBottom: 20},
  dot: {width: 14, height: 14, borderRadius: 7},
  pad: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, paddingHorizontal: 40},
  key: {width: 72, height: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  keyTxt: {fontSize: 24, color: '#FFF'},
  doneBtn: {alignItems: 'center', padding: 14, marginTop: 8},
  row: {flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14},
});
