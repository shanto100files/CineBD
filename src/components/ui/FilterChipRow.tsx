import React from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from './Text';
import {useM3Colors} from '../../theme/M3PaletteContext';

export interface FilterChip {
  key: string;
  label: string;
  count?: number;
}

/**
 * Horizontally scrolling chip row for filters/sorts.
 * variant 'filter' = multi-select toggle chips.
 * variant 'sort' = single-select chips with a sort icon on the active one.
 */
export const FilterChipRow = ({
  chips,
  selected,
  onToggle,
  variant = 'filter',
}: {
  chips: FilterChip[];
  selected: Set<string> | string;
  onToggle: (key: string) => void;
  variant?: 'filter' | 'sort';
}) => {
  const colors = useM3Colors();
  const isSort = variant === 'sort';
  const selectedKeys: Set<string> = isSort
    ? new Set([selected as string])
    : (selected as Set<string>);

  if (chips.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.grow}>
      {chips.map(chip => {
        const active = selectedKeys.has(chip.key);
        return (
          <Pressable
            key={chip.key}
            onPress={() => onToggle(chip.key)}
            accessibilityRole="button"
            accessibilityLabel={`${chip.label}${chip.count != null ? `, ${chip.count} results` : ''}`}
            style={[
              styles.chip,
              {
                backgroundColor: active
                  ? colors.primaryContainer
                  : colors.surfaceContainerHighest,
                borderColor: active ? colors.primary : colors.outlineVariant,
              },
            ]}>
            {isSort && active ? (
              <MaterialCommunityIcons
                name="arrow-down"
                size={13}
                color={colors.onPrimaryContainer}
              />
            ) : null}
            <AppText
              style={[
                styles.label,
                {
                  color: active
                    ? colors.onPrimaryContainer
                    : colors.onSurfaceVariant,
                },
              ]}>
              {chip.label}
              {chip.count != null ? ` (${chip.count})` : ''}
            </AppText>
            {!isSort && active ? (
              <MaterialCommunityIcons
                name="close"
                size={13}
                color={colors.onPrimaryContainer}
              />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  grow: {flexGrow: 0},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  label: {fontSize: 12.5, fontWeight: '600'},
});

export default FilterChipRow;
