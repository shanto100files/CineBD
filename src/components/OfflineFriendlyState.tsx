import React from 'react';
import {TouchableOpacity, View} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {useIsOffline} from '../lib/netStatus';
import {useM3Colors} from '../theme/M3PaletteContext';
import AppText from './ui/Text';

interface Props {
  /** Screen's own "no results" state — only replaced while offline. */
  hasContent?: boolean;
  onRetry?: () => void;
}

/**
 * When offline, replaces "No Content Found"/raw errors with a friendly
 * bilingual offline notice + retry. Renders nothing when online or when
 * there is (cached) content to show.
 */
const OfflineFriendlyState: React.FC<Props> = ({hasContent, onRetry}) => {
  const offline = useIsOffline();
  const colors = useM3Colors();

  if (!offline || hasContent) {
    return null;
  }

  return (
    <View className="w-full h-full flex items-center justify-center px-8">
      <MaterialIcons name="cloud-off" size={44} color={colors.onSurfaceVariant} />
      <AppText
        role="titleMedium"
        className="text-center mt-3"
        style={{color: colors.onSurface}}>
        ইন্টারনেট সংযোগ নেই
      </AppText>
      <AppText
        role="bodySmall"
        className="text-center mt-1"
        style={{color: colors.onSurfaceVariant}}>
        No internet connection — reconnect and try again
      </AppText>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          className="mt-4 rounded-full px-6 py-2.5"
          style={{backgroundColor: colors.primary}}>
          <AppText role="labelLarge" style={{color: colors.onPrimary, fontWeight: '700'}}>
            Retry · আবার চেষ্টা করুন
          </AppText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default OfflineFriendlyState;
