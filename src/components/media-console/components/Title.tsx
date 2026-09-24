import React from 'react';
import {Text, View} from 'react-native';
import {styles} from './styles';

interface TitleProps {
  primary: string;
  secondary?: string;
}

export const Title = (title: TitleProps) => {
  if (title && (title.primary || title.secondary)) {
    return (
      <View style={[_styles.title, _styles.pill]}>
        <Text style={[styles.text, _styles.titleText]} numberOfLines={1}>
          {title.primary}
        </Text>
        {title.secondary && (
          <Text
            style={[_styles.secondaryText, {color: 'hsl(0, 0%, 72%)'}]}
            numberOfLines={1}>
            {title.secondary}
          </Text>
        )}
      </View>
    );
  }

  return null;
};

import {StyleSheet} from 'react-native';

const _styles = StyleSheet.create({
  title: {
    alignItems: 'center',
    flexDirection: 'column',
    maxWidth: 420,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  titleText: {
    textAlign: 'center',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  secondaryText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
