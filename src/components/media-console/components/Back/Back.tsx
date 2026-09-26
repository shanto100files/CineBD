import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {Control} from '../Control';

interface BackProps {
  onBack: () => void;
  resetControlTimeout?: () => void;
  showControls: boolean;
}

export const Back = ({onBack, showControls}: BackProps) => {
  return (
    <Control callback={onBack} disabled={!showControls}>
      <MaterialIcons
        name="arrow-back-ios-new"
        size={22}
        color="#FFFFFF"
        style={{textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3}}
      />
    </Control>
  );
};
