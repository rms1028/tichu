import React, { useState, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useGameStore } from '../src/stores/gameStore';
import { useSocket } from '../src/hooks/useSocket';
import { LobbyScreen } from '../src/screens/LobbyScreen';
import { MatchmakingScreen } from '../src/screens/MatchmakingScreen';
import { GameScreen } from '../src/screens/GameScreen';
import { GameResultScreen } from '../src/screens/GameResultScreen';
import { TutorialModal } from '../src/components/TutorialModal';
import { ToastProvider, useToast } from '../src/components/ToastSystem';
import { EmoteButton } from '../src/components/EmotePanel';
import { useUserStore, getTier } from '../src/stores/userStore';
import { useAchievementStore } from '../src/stores/achievementStore';
import { AchievementPopup } from '../src/components/AchievementPopup';
import { SplashScreen } from '../src/screens/SplashScreen';
import { DisconnectOverlay } from '../src/components/DisconnectOverlay';

type AppScreen = 'splash' | 'lobby' | 'matchmaking' | 'game' | 'result';

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
      <AchievementPopup />
    </ToastProvider>
  );
}

function AppInner() {
  const roomId = useGameStore((s) => s.roomId);
  const gameOver = useGameStore((s) => s.gameOver);
  const mySeat = useGameStore((s) => s.mySeat);
  const players = useGameStore((s) => s.players);
  const roundResult = useGameStore((s) => s.roundResult);

  const {
    joinRoom, declareTichu, passTichu,
    exchangeCards, playCards, passTurn,
    dragonGive, submitBomb, addBots, swapSeat,
    queueMatch, cancelMatch,
    friendInit, friendSearch, friendRequest, friendAccept, friendReject, friendRemove, friendInvite,
  } = useSocket();

  const [screen, setScreen] = useState<AppScreen>('splash');
  const [matchMode, setMatchMode] = useState<'quick' | 'custom'>('quick');
  const [matchRoomCode, setMatchRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [firstVisit, setFirstVisit] = useState(true);
  const [emoteMsg, setEmoteMsg] = useState<{ emoji: string; label: string } | null>(null);
  const resultRecorded = useRef(false);

  // roomId는 매칭 대기실에서 이미 설정됨 — 게임 전환은 MatchmakingScreen의 onStart에서 처리

  // gameOver 시 결과 화면으로
  useEffect(() => {
    if (gameOver && screen === 'game') {
      // 약간의 딜레이 후 결과 화면
      const t = setTimeout(() => setScreen('result'), 2000);
      return () => clearTimeout(t);
    }
  }, [gameOver]);

  // 첫 방문 튜토리얼 프롬프트
  const handleTutorialPrompt = () => {
    if (firstVisit) {
      setFirstVisit(false);
      setShowTutorial(true);
    }
  };

  // 스플래시
  if (screen === 'splash') {
    return <SplashScreen onFinish={() => setScreen('lobby')} />;
  }

  // 로비
  if (screen === 'lobby') {
    return (
      <>
        <LobbyScreen
          onJoin={(room, playerId, nick) => {
          setNickname(nick);
          if (room.startsWith('std_')) {
            // 빠른매칭 → 서버 큐에 참가
            setMatchMode('quick');
            setMatchRoomCode('');
            setScreen('matchmaking');
            queueMatch(playerId, nick);
          } else {
            // 커스텀 → 직접 방 참가
            setMatchMode('custom');
            setMatchRoomCode(room);
            setScreen('matchmaking');
            joinRoom(room, playerId, nick);
          }
        }}
        onTutorial={() => setShowTutorial(true)}
        onFriendInit={friendInit}
        onFriendSearch={friendSearch}
        onFriendRequest={friendRequest}
        onFriendAccept={friendAccept}
        onFriendReject={friendReject}
        onFriendRemove={friendRemove}
        onFriendInvite={friendInvite}
      />
      <TutorialModal visible={showTutorial} onClose={() => setShowTutorial(false)} />
      </>
    );
  }

  // 매칭 대기실
  if (screen === 'matchmaking') {
    return (
      <MatchmakingScreen
        mode={matchMode}
        roomCode={matchRoomCode}
        nickname={nickname}
        onCancel={() => {
          if (matchMode === 'quick') cancelMatch();
          useGameStore.getState().reset();
          setScreen('lobby');
        }}
        onStart={() => {
          setScreen('game');
        }}
        onAddBots={addBots}
        onSwapSeat={swapSeat}
      />
    );
  }

  // 결과 화면
  if (screen === 'result' && gameOver) {
    const myTeam = mySeat === 0 || mySeat === 2 ? 'team1' : 'team2';
    const isWin = gameOver.winner === myTeam;
    const uStore = useUserStore.getState();
    const myTichu = roundResult?.tichuDeclarations?.[mySeat];
    const tichuDeclared = myTichu === 'large' || myTichu === 'small';

    // 보상 지급 (한 번만)
    const xpBefore = uStore.xp;
    if (!resultRecorded.current) {
      resultRecorded.current = true;
      uStore.recordGameResult(isWin, tichuDeclared, tichuDeclared && isWin);
      const achStore = useAchievementStore.getState();
      const us = useUserStore.getState();
      achStore.checkProgress('totalGames', us.totalGames);
      achStore.checkProgress('wins', us.wins);
      achStore.checkProgress('winStreak', us.winStreak);
      if (tichuDeclared && isWin) achStore.checkProgress('tichuSuccess', us.tichuSuccess);
    }
    const xpAfterVal = useUserStore.getState().xp;
    const curTier = getTier(xpBefore);
    const newTier = getTier(xpAfterVal);
    const tierUp = newTier.name !== curTier.name;

    const resultPlayers = [0, 1, 2, 3].map(seat => ({
      seat,
      name: players[seat]?.nickname ?? `P${seat + 1}`,
      avatar: seat === mySeat
        ? (require('../src/stores/userStore').SHOP_AVATARS.find((a: any) => a.id === useUserStore.getState().equippedAvatar)?.emoji ?? '🐲')
        : ['🐲', '🦁', '🐻', '🦊'][seat]!,
      tier: '🥈',
      cardsPlayed: Math.floor(Math.random() * 10) + 5,
      tichu: (roundResult?.tichuDeclarations?.[seat] as 'large' | 'small' | null) ?? null,
      tichuSuccess: seat === mySeat ? (tichuDeclared && isWin) : Math.random() > 0.5,
      isMvp: seat === (isWin ? mySeat : (mySeat + 1) % 4),
    }));

    const rewardCoins = isWin ? 50 : 20;
    const tichuBonus = tichuDeclared && isWin ? 10 : 0;

    return (
      <GameResultScreen
        winner={gameOver.winner}
        myTeam={myTeam}
        scores={gameOver.scores}
        players={resultPlayers}
        rewards={{
          coins: rewardCoins,
          xp: isWin ? 30 : 10,
          bonusCoins: isWin ? 20 : 0,
          tichuBonus,
        }}
        xpBefore={xpBefore}
        xpAfter={xpAfterVal}
        xpMax={newTier.max}
        tierUp={tierUp}
        onRematch={() => {
          resultRecorded.current = false;
          useGameStore.getState().reset();
          setScreen('matchmaking');
          setMatchMode('quick');
          queueMatch(useUserStore.getState().playerId, nickname);
        }}
        onLobby={() => {
          resultRecorded.current = false;
          useGameStore.getState().reset();
          setScreen('lobby');
        }}
      />
    );
  }

  // 게임 화면
  return (
    <View style={{ flex: 1 }}>
    <GameScreen
      onPlay={playCards}
      onPass={passTurn}
      onDeclareTichu={declareTichu}
      onPassTichu={passTichu}
      onExchange={exchangeCards}
      onDragonGive={dragonGive}
      onAddBots={addBots}
      onSubmitBomb={() => {
        const selected = useGameStore.getState().selectedCards;
        if (selected.length > 0) {
          submitBomb(selected);
          useGameStore.getState().clearSelection();
        }
      }}
      onSubmitBombCards={(cards) => {
        submitBomb(cards);
      }}
      onBackToLobby={() => {
        useGameStore.getState().reset();
        setScreen('lobby');
      }}
    />
    <DisconnectOverlay onLobby={() => { resultRecorded.current = false; useGameStore.getState().reset(); setScreen('lobby'); }} />
    </View>
  );
}
