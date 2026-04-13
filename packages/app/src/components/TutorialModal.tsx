import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '../utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// NOTE: In-tree overlay (not RN <Modal>) — RN 0.76 + New Arch + Bridgeless
// has a bug where native Modal's Android Dialog steals parent window focus
// and freezes gesture state. See commit 05fabec.
export function TutorialModal({ visible, onClose }: Props) {
  if (!visible) return null;
  return (
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>How to Play Tichu</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.section}>Basic Rules</Text>
            <Text style={styles.body}>
              Tichu is a 4-player (2v2) trick-taking climbing card game.{'\n'}
              The goal is to be the first team to reach 1,000 points.{'\n\n'}
              Each round, try to empty your hand before your opponents.
            </Text>
            <Text style={styles.section}>Card Combinations</Text>
            <Text style={styles.body}>
              Single, Pair, Triple, Full House, Straight (5+), Consecutive Pairs (2+), Bombs
            </Text>
            <Text style={styles.section}>Special Cards</Text>
            <Text style={styles.body}>
              Mahjong (1) - Leads first, can declare a wish{'\n'}
              Dog - Passes lead to your partner{'\n'}
              Phoenix - Wild card, -25 points{'\n'}
              Dragon - Highest single, +25 points, must give trick to opponent
            </Text>
            <Text style={styles.section}>Tichu Declaration</Text>
            <Text style={styles.body}>
              Large Tichu (+/-200): Declare before seeing all cards{'\n'}
              Small Tichu (+/-100): Declare before playing your first card
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    width: '85%',
    maxHeight: '80%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 400,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 14,
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
