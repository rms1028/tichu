import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useGameStore } from '../stores/gameStore';
import { useTeamInfo } from '../hooks/useGame';
import { COLORS, FONT } from '../utils/theme';
import { isMobile, mob } from '../utils/responsive';

const TARGET_SCORE = 1000;

export function ScoreBoard() {
  const scores = useGameStore((s) => s.scores);
  const { myTeam } = useTeamInfo();

  const t1Pct = Math.min(100, (scores.team1 / TARGET_SCORE) * 100);
  const t2Pct = Math.min(100, (scores.team2 / TARGET_SCORE) * 100);

  // 모바일: 한 줄 컴팩트
  if (isMobile) {
    return (
      <View style={mS.container}>
        <Text style={[mS.score, { color: COLORS.team1 }]}>{scores.team1}</Text>
        <Text style={mS.sep}>:</Text>
        <Text style={[mS.score, { color: COLORS.team2 }]}>{scores.team2}</Text>
        <Text style={mS.target}>/{TARGET_SCORE}</Text>
      </View>
    );
  }

  // 데스크탑: 기존 풀 디자인
  return (
    <View style={styles.container}>
      <View style={[styles.teamBlock, myTeam === 'team1' && styles.myTeamBlock]}>
        <Text style={[styles.label, { color: COLORS.team1 }]}>팀1</Text>
        <Text style={[styles.score, { color: COLORS.team1 }]}>{scores.team1}</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${t1Pct}%`, backgroundColor: COLORS.team1 }]} />
        </View>
      </View>
      <View style={styles.centerCol}>
        <Text style={styles.separator}>:</Text>
        <Text style={styles.target}>{TARGET_SCORE}</Text>
      </View>
      <View style={[styles.teamBlock, myTeam === 'team2' && styles.myTeamBlock]}>
        <Text style={[styles.label, { color: COLORS.team2 }]}>팀2</Text>
        <Text style={[styles.score, { color: COLORS.team2 }]}>{scores.team2}</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${t2Pct}%`, backgroundColor: COLORS.team2 }]} />
        </View>
      </View>
    </View>
  );
}

// 모바일 스타일
const mS = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, gap: 4,
  },
  score: { fontSize: 14, fontWeight: '900' },
  sep: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '700' },
  target: { color: 'rgba(255,255,255,0.25)', fontSize: 10, marginLeft: 2 },
});

// 데스크탑 스타일
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bgDark,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  teamBlock: { alignItems: 'center', minWidth: 50, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  myTeamBlock: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1.5, borderColor: COLORS.accent },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  score: { fontSize: 22, fontWeight: '900', lineHeight: 26, textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  centerCol: { alignItems: 'center' },
  separator: { color: COLORS.textDim, fontSize: 18, fontWeight: 'bold' },
  target: { color: COLORS.textDim, fontSize: 10, fontWeight: '700', opacity: 0.8 },
  barBg: { width: '100%', height: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, marginTop: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
