import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SettingsStackParamList} from '../../App';
import AppText from '../../components/ui/Text';
import {useM3Colors} from '../../theme/M3PaletteContext';
import {friendsService, FriendProfile} from '../../lib/services/friendsService';

type Props = NativeStackScreenProps<SettingsStackParamList, 'FriendProfile'>;

const FriendProfileScreen = ({navigation, route}: Props) => {
  const colors = useM3Colors();
  const {userId, username} = route.params;
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    friendsService
      .getProfile(userId)
      .then(setProfile)
      .catch(() => ToastAndroid.show('লোড করা যায়নি', ToastAndroid.SHORT))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const doRemove = () => {
    setBusy(true);
    friendsService
      .unfriend(userId)
      .then(() => {
        ToastAndroid.show('বন্ধু সরানো হয়েছে', ToastAndroid.SHORT);
        navigation.goBack();
      })
      .catch(() => ToastAndroid.show('ব্যর্থ হয়েছে', ToastAndroid.SHORT))
      .finally(() => setBusy(false));
  };

  const doBlock = () => {
    setBusy(true);
    friendsService
      .blockUser(userId)
      .then(() => {
        ToastAndroid.show('ব্লক করা হয়েছে', ToastAndroid.SHORT);
        navigation.goBack();
      })
      .catch(() => ToastAndroid.show('ব্যর্থ হয়েছে', ToastAndroid.SHORT))
      .finally(() => setBusy(false));
  };

  const doUnblock = () => {
    setBusy(true);
    friendsService
      .unblockUser(userId)
      .then(() => {
        ToastAndroid.show('আনব্লক করা হয়েছে', ToastAndroid.SHORT);
        load();
      })
      .catch(() => ToastAndroid.show('ব্যর্থ হয়েছে', ToastAndroid.SHORT))
      .finally(() => setBusy(false));
  };

  return (
    <View style={{backgroundColor: colors.background, flex: 1}}>
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          paddingHorizontal: 8,
          paddingTop: 8,
        }}>
        <TouchableOpacity onPress={navigation.goBack} style={{padding: 10}}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={colors.onBackground}
          />
        </TouchableOpacity>
        <AppText role="titleLargeEmphasized" style={{color: colors.onBackground}}>
          প্রোফাইল
        </AppText>
      </View>

      {loading ? (
        <ActivityIndicator style={{marginTop: 60}} size="large" color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{padding: 20, paddingBottom: 40}}>
          <View style={{alignItems: 'center', marginTop: 10}}>
            <View
              style={{
                alignItems: 'center',
                backgroundColor: colors.primaryContainer,
                borderRadius: 48,
                height: 96,
                justifyContent: 'center',
                width: 96,
              }}>
              <AppText
                role="displaySmallEmphasized"
                style={{color: colors.onPrimaryContainer}}>
                {(profile?.username || username || '?').slice(0, 1).toUpperCase()}
              </AppText>
            </View>
            <AppText
              role="headlineSmallEmphasized"
              style={{color: colors.onBackground, marginTop: 12}}>
              {profile?.username || username}
            </AppText>
            {profile?.is_friend ? (
              <View
                style={{
                  backgroundColor: colors.primaryContainer,
                  borderRadius: 12,
                  marginTop: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 4,
                }}>
                <AppText role="labelMediumEmphasized" style={{color: colors.onPrimaryContainer}}>
                  ✓ বন্ধু
                </AppText>
              </View>
            ) : null}
          </View>

          {/* Stats row */}
          <View
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderRadius: 16,
              flexDirection: 'row',
              gap: 12,
              marginTop: 20,
              padding: 14,
            }}>
            <View style={{alignItems: 'center', flex: 1}}>
              <AppText role="titleLargeEmphasized" style={{color: colors.primary}}>
                {profile?.shared_to_me ?? 0}
              </AppText>
              <AppText role="labelSmallEmphasized" style={{color: colors.onSurfaceVariant}}>
                শেয়ারড
              </AppText>
            </View>
            <View style={{alignItems: 'center', flex: 1}}>
              <AppText role="titleLargeEmphasized" style={{color: colors.tertiary}}>
                {profile?.recent_items ?? 0}
              </AppText>
              <AppText role="labelSmallEmphasized" style={{color: colors.onSurfaceVariant}}>
                সাম্প্রতিক দেখা
              </AppText>
            </View>
            <View style={{alignItems: 'center', flex: 1}}>
              <MaterialCommunityIcons
                name={profile?.activity_visible ? 'eye' : 'eye-off'}
                size={22}
                color={colors.onSurfaceVariant}
                style={{marginTop: 4}}
              />
              <AppText role="labelSmallEmphasized" style={{color: colors.onSurfaceVariant}}>
                {profile?.activity_visible ? 'activity শেয়ার করে' : 'activity ব্যক্তিগত'}
              </AppText>
            </View>
          </View>

          {/* Actions */}
          {profile?.is_friend ? (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('FriendChat', {userId, username: profile.username})
              }
              style={{
                alignItems: 'center',
                backgroundColor: colors.primary,
                borderRadius: 16,
                flexDirection: 'row',
                gap: 8,
                justifyContent: 'center',
                marginTop: 16,
                paddingVertical: 14,
              }}>
              <MaterialCommunityIcons name="message" size={20} color={colors.onPrimary} />
              <AppText role="labelLargeEmphasized" style={{color: colors.onPrimary}}>
                Message
              </AppText>
            </TouchableOpacity>
          ) : null}

          <View style={{flexDirection: 'row', gap: 10, marginTop: 12}}>
            {profile?.is_friend ? (
              <TouchableOpacity
                disabled={busy}
                onPress={doRemove}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.errorContainer,
                  borderRadius: 16,
                  flex: 1,
                  flexDirection: 'row',
                  gap: 6,
                  justifyContent: 'center',
                  paddingVertical: 12,
                }}>
                <MaterialCommunityIcons name="account-minus" size={18} color={colors.error} />
                <AppText role="labelLargeEmphasized" style={{color: colors.error}}>
                  Remove Friend
                </AppText>
              </TouchableOpacity>
            ) : null}
            {profile?.blocked_by_me ? (
              <TouchableOpacity
                disabled={busy}
                onPress={doUnblock}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.surfaceContainerHigh,
                  borderRadius: 16,
                  flex: 1,
                  flexDirection: 'row',
                  gap: 6,
                  justifyContent: 'center',
                  paddingVertical: 12,
                }}>
                <MaterialCommunityIcons
                  name="lock-open-variant"
                  size={18}
                  color={colors.onSurfaceVariant}
                />
                <AppText role="labelLargeEmphasized" style={{color: colors.onSurfaceVariant}}>
                  Unblock
                </AppText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                disabled={busy}
                onPress={doBlock}
                style={{
                  alignItems: 'center',
                  backgroundColor: colors.errorContainer,
                  borderRadius: 16,
                  flex: 1,
                  flexDirection: 'row',
                  gap: 6,
                  justifyContent: 'center',
                  paddingVertical: 12,
                }}>
                <MaterialCommunityIcons name="block-helper" size={18} color={colors.error} />
                <AppText role="labelLargeEmphasized" style={{color: colors.error}}>
                  Block
                </AppText>
              </TouchableOpacity>
            )}
          </View>

          {profile?.i_am_blocked ? (
            <AppText
              role="labelSmallEmphasized"
              style={{color: colors.onSurfaceVariant, marginTop: 12, textAlign: 'center'}}>
              এই ইউজার আপনাকে ব্লক করেছে
            </AppText>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
};

export default FriendProfileScreen;
