import React, {useState} from 'react';
import {Image, View} from 'react-native';
import AppText from '../ui/Text';
import {absoluteAvatarUrl} from '../../lib/utils/avatarUrl';
import {useM3Colors} from '../../theme/M3PaletteContext';

interface FriendAvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
}

const FriendAvatar = ({name, uri, size = 42}: FriendAvatarProps) => {
  const colors = useM3Colors();
  const [failed, setFailed] = useState(false);
  const source = absoluteAvatarUrl(uri);

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: colors.primaryContainer,
        borderRadius: size / 2,
        height: size,
        justifyContent: 'center',
        overflow: 'hidden',
        width: size,
      }}>
      {source && !failed ? (
        <Image
          source={{uri: source}}
          onError={() => setFailed(true)}
          style={{height: size, width: size}}
        />
      ) : (
        <AppText
          role="titleMediumEmphasized"
          style={{
            color: colors.onPrimaryContainer,
            fontSize: Math.round(size * 0.38),
          }}>
          {name.slice(0, 1).toUpperCase()}
        </AppText>
      )}
    </View>
  );
};

export default FriendAvatar;
