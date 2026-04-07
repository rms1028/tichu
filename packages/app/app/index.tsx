import React, { useState, useEffect, useRef } from 'react';
import { View, LogBox, Platform } from 'react-native';
import { useGameStore } from '../src/stores/gameStore';

// React Native Web에서 Reanimated가 만드는 공백 텍스트 노드 경고 무시
LogBox.ignoreLogs(['Unexpected text node']);
if (Platform.OS === 'web') {
  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Unexpected text node')) return;
    origWarn(...args);
  };
}
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
import { LoginScreen } from '../src/screens/LoginScreen';
import { signInWithGoogle, signInAsGuest, signOutUser } from '../src/utils/firebase';
import { playBgm, setBgmEnabled, stopAll as stopBgm } from '../src/utils/bgm';
import { cancelAllSounds } from '../src/utils/sound';

type AppScreen = 'splash' | 'login' | 'lobby' | 'matchmaking' | 'game' | 'result';

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
    createCustomRoom, listRooms, startGame, addBotToSeat, removeBot,
    friendInit, friendSearch, friendRequest, friendAccept, friendReject, friendRemove, friendInvite,
    guestLogin, firebaseLogin, getLeaderboard, getGameHistory, sendEmote, buyShopItem, equipShopItem, changeNickname,
    leaveRoom, moveSeat, shuffleTeams,
  } = useSocket();

  const connected = useGameStore((s) => s.connected);

  const [screen, setScreen] = useState<AppScreen>('splash');
  const [matchMode, setMatchMode] = useState<'quick' | 'custom'>('quick');
  const [matchRoomCode, setMatchRoomCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // 이미 로그인된 사용자 체크 (닉네임 있으면 스킵)
  useEffect(() => {
    const us = useUserStore.getState();
    if (us.nickname && us.playerId) {
      // 이미 게스트/소셜 로그인 상태
      if (connected) {
        guestLogin(us.playerId, us.nickname);
      }
    }
  }, [connected]);
  const [firstVisit, setFirstVisit] = useState(true);
  const [emoteMsg, setEmoteMsg] = useState<{ emoji: string; label: string } | null>(null);
  const resultRecorded = useRef(false);

  // ── BGM 전환 ─────────────────────────────────────────────
  useEffect(() => {
    const musicOn = useUserStore.getState().musicOn;
    setBgmEnabled(musicOn);
  }, []);

  useEffect(() => {
    if (screen === 'game') {
      playBgm('game');
    } else if (screen === 'lobby' || screen === 'matchmaking') {
      playBgm('lobby');
    } else if (screen === 'result') {
      playBgm('lobby');
    }
  }, [screen]);

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

  // 로그인 핸들러
  const handleGuestLogin = (nick: string) => {
    setLoginLoading(true);
    setLoginError(null);
    const us = useUserStore.getState();
    us.setNickname(nick);
    setNickname(nick);
    guestLogin(us.playerId, nick);
    setLoginLoading(false);
    setScreen('lobby');
  };

  const handleGoogleLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const user = await signInWithGoogle();
      const idToken = await user.getIdToken();
      const nick = user.displayName || user.email?.split('@')[0] || 'Player';
      const us = useUserStore.getState();
      us.setNickname(nick);
      setNickname(nick);
      firebaseLogin(idToken, nick);
      setScreen('lobby');
    } catch (err: any) {
      console.error('Google login error:', err);
      setLoginError('Google 로그인에 실패했습니다');
    } finally {
      setLoginLoading(false);
    }
  };

  // 스플래시
  if (screen === 'splash') {
    return <SplashScreen onFinish={() => {
      const us = useUserStore.getState();
      setScreen(us.nickname ? 'lobby' : 'login');
    }} />;
  }

  // 로그인
  if (screen === 'login') {
    return (
      <LoginScreen
        onGuestLogin={handleGuestLogin}
        onGoogleLogin={handleGoogleLogin}
        loading={loginLoading}
        error={loginError}
      />
    );
  }

  // 로비
  if (screen === 'lobby') {
    return (
      <>
        <LobbyScreen
          onJoin={(room, playerId, nick, password) => {
          setNickname(nick);
          if (room.startsWith('std_')) {
            setMatchMode('quick');
            setMatchRoomCode('');
            setScreen('matchmaking');
            queueMatch(playerId, nick);
          } else {
            setMatchMode('custom');
            setMatchRoomCode(room);
            setScreen('matchmaking');
            joinRoom(room, playerId, nick, password);
          }
        }}
        onCreateCustomRoom={(roomName, password, playerId, nick) => {
          setNickname(nick);
          setMatchMode('custom');
          setScreen('matchmaking');
          createCustomRoom(roomName, password, playerId, nick);
        }}
        onListRooms={listRooms}
        onGetLeaderboard={getLeaderboard}
        onTutorial={() => setShowTutorial(true)}
        onFriendInit={friendInit}
        onFriendSearch={friendSearch}
        onFriendRequest={friendRequest}
        onFriendAccept={friendAccept}
        onFriendReject={friendReject}
        onFriendRemove={friendRemove}
        onFriendInvite={friendInvite}
        onBuyShopItem={buyShopItem}
        onEquipShopItem={equipShopItem}
        onChangeNickname={changeNickname}
        onGetGameHistory={getGameHistory}
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
          leaveRoom();
          setScreen('lobby');
        }}
        onStart={() => {
          setScreen('game');
        }}
        onAddBots={addBots}
        onSwapSeat={swapSeat}
        onMoveSeat={moveSeat}
        onShuffleTeams={shuffleTeams}
        onStartGame={startGame}
        onAddBotToSeat={addBotToSeat}
        onRemoveBot={removeBot}
      />
    );
  }

  // 결과 화면 — gameOver가 null이면 로비로 복귀
  if (screen === 'result' && !gameOver) {
    setScreen('lobby');
    return null;
  }
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
          leaveRoom();
          setScreen('matchmaking');
          setMatchMode('quick');
          queueMatch(useUserStore.getState().playerId, nickname);
        }}
        onLobby={() => {
          resultRecorded.current = false;
          leaveRoom();
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
      onSendEmote={sendEmote}
      onBackToLobby={() => {
        leaveRoom();
        setScreen('lobby');
      }}
    />
    <DisconnectOverlay onLobby={() => { resultRecorded.current = false; leaveRoom(); setScreen('lobby'); }} />
    </View>
  );
}
