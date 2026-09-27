import React from 'react';
import {View, StyleSheet} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {Control} from '../Control';

interface BackProps {
  onBack: () => void;
  resetControlTimeout?: () => void;
  showControls: boolean;
}

const _styles = StyleSheet.create({
  pill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});

export const Back = ({onBack, showControls}: BackProps) => {
  return (
    <Control callback={onBack} disabled={!showControls} style={{padding: 8}}>
      <View style={_styles.pill}>
        <MaterialIcons
          name="arrow-back-ios-new"
          size={22}
          color="#FFFFFF"
          style={{textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3}}
        />
      </View>
    </Control>
  );
};
