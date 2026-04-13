// ⚠️ 이 import 는 반드시 최상단에 위치 — 글로벌 에러 핸들러를 가장 먼저 설치.
// 다른 import 가 모듈 load 단계에서 throw 해도 캡처할 수 있도록.
import { installGlobalErrorHandler, captureManual } from './utils/globalErrorCapture';
installGlobalErrorHandler();

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, LogBox, Platform } from 'react-native';
import { useGameStore } from './stores/gameStore';

// React Native Web에서 Reanimated가 만드는 공백 텍스트 노드 경고 무시
LogBox.ignoreLogs(['Unexpected text node']);
if (Platform.OS === 'web') {
  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Unexpected text node')) return;
    origWarn(...args);
  };
}
import { useSocket } from './hooks/useSocket';
import { LobbyScreen } from './screens/LobbyScreen';
import { MatchmakingScreen } from './screens/MatchmakingScreen';
import { GameScreen } from './screens/GameScreen';
import { GameResultScreen } from './screens/GameResultScreen';
import { TutorialModal } from './components/TutorialModal';
import { ToastProvider, useToast } from './components/ToastSystem';
import { EmoteButton } from './components/EmotePanel';
import { useUserStore, getTier } from './stores/userStore';
import { useAchievementStore } from './stores/achievementStore';
import { AchievementPopup } from './components/AchievementPopup';
import { SplashScreen } from './screens/SplashScreen';
import { DisconnectOverlay } from './components/DisconnectOverlay';
import { LoginScreen } from './screens/LoginScreen';
import { signInWithGoogle, signInWithGoogleIdToken, signInAsGuest, signOutUser } from './utils/firebase';
import { GOOGLE_OAUTH, isGoogleOAuthConfigured } from './utils/googleOAuth';
// 🩺 expo-auth-session / expo-web-browser 의 module-level import 가 Android
// native init 시점에 크래시를 일으키는지 검증하기 위해 일시적으로 제거.
// native Google 로그인 경로는 이 빌드에서 비활성. 웹 popup 은 영향 없음.
// import * as Google from 'expo-auth-session/providers/google';
// import * as WebBrowser from 'expo-web-browser';
import { ErrorBoundary } from './components/ErrorBoundary';

// WebBrowser.maybeCompleteAuthSession() 도 일시 비활성 (위 import 제거의 일부)
import { playBgm, setBgmEnabled, stopAll as stopBgm } from './utils/bgm';
import { cancelAllSounds } from './utils/sound';

type AppScreen = 'splash' | 'login' | 'lobby' | 'matchmaking' | 'game' | 'result';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppInner />
        <AchievementPopup />
      </ToastProvider>
    </ErrorBoundary>
  );
}

function AppInner() {
  const roomId = useGameStore((s) => s.roomId);
  const gameOver = useGameStore((s) => s.gameOver);
  const mySeat = useGameStore((s) => s.mySeat);
  const players = useGameStore((s) => s.players);
  const roundResult = useGameStore((s) => s.roundResult);
  const phase = useGameStore((s) => s.phase);
  const forceUpdate = useGameStore((s) => s.forceUpdate);

  const {
    joinRoom, declareTichu, passTichu,
    exchangeCards, playCards, passTurn,
    dragonGive, submitBomb, addBots, swapSeat,
    queueMatch, cancelMatch,
    createCustomRoom, listRooms, startGame, addBotToSeat, removeBot,
    friendInit, friendSearch, friendRequest, friendAccept, friendReject, friendRemove, friendInvite,
    guestLogin, firebaseLogin, getLeaderboard, getGameHistory, sendEmote, buyShopItem, equipShopItem, changeNickname,
    leaveRoom, moveSeat, shuffleTeams, claimAttendance, deleteAccount,
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

  // ── 네이티브 Google 로그인 (expo-auth-session) — 일시 비활성 ────
  // 모듈 레벨 import 가 native crash 원인 후보라서 이 빌드에서는 stub.
  // 복원 조건: Android 부팅 검증 후 별도 파일 + React.lazy 로 이관.

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

  // 재접속 시 게임 진행 중이면 게임 화면으로 전환 (로비에서만 — 매칭 대기실은 카운트다운 사용)
  useEffect(() => {
    if (screen === 'lobby' && roomId && phase &&
        phase !== 'WAITING_FOR_PLAYERS' && phase !== 'GAME_OVER') {
      setScreen('game');
    }
  }, [phase, roomId, screen]);

  // gameOver 시 결과 화면으로
  useEffect(() => {
    if (gameOver && screen === 'game') {
      // 약간의 딜레이 후 결과 화면
      const t = setTimeout(() => setScreen('result'), 2000);
      return () => clearTimeout(t);
    }
  }, [gameOver]);

  // 결과 화면 — gameOver가 null이면 로비로 복귀
  useEffect(() => {
    if (screen === 'result' && !gameOver) {
      setScreen('lobby');
    }
  }, [screen, gameOver]);

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
    // 웹: Firebase popup
    if (Platform.OS === 'web') {
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
      return;
    }
    // 🩺 네이티브 Google 로그인 일시 비활성 — 디버그 빌드.
    // expo-auth-session module-level import 가 native crash 후보라서 import 자체를 제거함.
    // 게스트 로그인을 사용해 주세요.
    void isGoogleOAuthConfigured;  // 미사용 경고 회피
    setLoginError('이 빌드에서는 Google 로그인 일시 비활성. 게스트 로그인을 사용해 주세요.');
    setLoginLoading(false);
  };

  // 스플래시
  // 강제 업데이트 필요 시
  if (forceUpdate) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <Text style={{ color: '#FFD700', fontSize: 24, fontWeight: '900', marginBottom: 16 }}>{'업데이트 필요'}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 22 }}>
          {'새로운 버전이 출시되었습니다.\n앱을 업데이트한 후 다시 시작해주세요.'}
        </Text>
      </View>
    );
  }

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
        onCreateCustomRoom={(roomName, password, playerId, nick, options) => {
          setNickname(nick);
          setMatchMode('custom');
          setScreen('matchmaking');
          createCustomRoom(roomName, password, playerId, nick, options);
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
        onClaimAttendance={claimAttendance}
        onDeleteAccount={() => { deleteAccount(); setScreen('login'); }}
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
        ? (require('./stores/userStore').SHOP_AVATARS.find((a: any) => a.id === useUserStore.getState().equippedAvatar)?.emoji ?? '🐲')
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
