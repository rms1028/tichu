# 티츄(Tichu) — 모바일 멀티플레이어 보드게임

## 개발 가이드

### 프로젝트 구조
```
tichu/
├── CLAUDE.md
├── packages/
│   ├── shared/          # 공유 타입 + 족보 검증 엔진 (순수 TypeScript, RN/Node 양쪽 사용)
│   │   └── src/
│   │       ├── types.ts           # Card, PlayedHand, GamePhase 등 공통 타입
│   │       ├── constants.ts       # 카드 값, 점수 매핑
│   │       ├── validate-hand.ts   # validateHand()
│   │       ├── can-beat.ts        # canBeat()
│   │       ├── valid-plays.ts     # getValidPlays(), getAvailableBombs()
│   │       ├── wish.ts            # mustFulfillWish()
│   │       └── scoring.ts         # 점수 정산
│   ├── server/          # Node.js + Socket.io 게임 서버
│   │   └── src/
│   │       ├── game-room.ts       # GameRoom 상태 관리
│   │       ├── game-engine.ts     # 상태 머신 + play_cards 파이프라인
│   │       ├── bomb-window.ts     # BOMB_WINDOW 시스템
│   │       ├── socket-handlers.ts # 소켓 이벤트 핸들러
│   │       ├── bot.ts             # AI 봇
│   │       └── index.ts           # 서버 엔트리
│   └── app/             # React Native (Expo) 클라이언트
│       └── src/
│           ├── stores/            # Zustand 스토어
│           ├── screens/           # 로비, 게임, 결과 화면
│           ├── components/        # 카드, 보드, 타이머 등
│           ├── hooks/             # useSocket, useGame 등
│           └── utils/             # 사운드, 햅틱 매니저
```

### 명령어
```bash
# 의존성 설치
npm install                        # 루트 (워크스페이스)

# 공유 라이브러리
cd packages/shared
npm run build                      # tsc 빌드
npm test                           # vitest 단위 테스트

# 서버
cd packages/server
npm run dev                        # ts-node-dev 개발 서버
npm test                           # vitest 통합 테스트

# 클라이언트
cd packages/app
npx expo start                     # Expo 개발 서버
npx expo run:ios                   # iOS 빌드
npx expo run:android               # Android 빌드

# ── Android 모바일 자동화 (EAS 없이, base APK + JS 스왑) ──
cd packages/app
npm run android:dev                # bundle → APK 리패킹 → install → 스크린샷 + logcat 캡처
npm run android:visual             # 시나리오 기반 visual regression (pixelmatch 기반)
npm run android:visual -- --update-baselines     # baseline 갱신
npm run android:visual -- --filter lobby         # 특정 시나리오만 실행
```

### 모바일 UI 검증 (필수 루틴)

UI/레이아웃 수정 후에는 **코드 레벨 검증만으로 끝내지 말고** 반드시 실제 디바이스에서 확인한다.
ADB 로 연결된 폰에서 직접 스크린샷을 받아 눈으로 확인하는 자동화가 이미 준비되어 있다.

**표준 사이클** (UI 변경 시):
1. `npm run android:dev` — 변경된 JS 번들로 APK 리패킹 후 설치 → 첫 페인트 스크린샷이 `packages/app/.android-dev/screenshots/` 에 저장
2. `npm run android:visual -- --filter <scenario>` — 기존 baseline 대비 diff 확인
3. diff 가 의도된 변경이면 `--update-baselines` 로 새 baseline 채택
4. 실제 스크린샷을 `Read` 툴로 열어 **눈으로** 레이아웃 확인 후 커밋

**시나리오 정의:** `packages/app/scripts/visual-test.mjs` 의 `SCENARIOS` 배열. 각 시나리오는 launch → tap/text/key step → settle → 캡처 → pixelmatch diff 순. 좌표는 Samsung 2340x1080 landscape 기준이며 **디바이스마다 재튜닝 필요**.

**알려진 제약:**
- React Native + Reanimated 뷰는 UIAutomator 에 노출되지 않음 → `uiautomator dump` 로 내부 버튼을 찾을 수 없다. PNG 에서 픽셀 좌표를 읽어 tap 한다.
- Logo glow / particle 애니메이션 때문에 `uiautomator dump` 가 "could not get idle state" 로 부분 덤프만 반환한다. 로비 이후 화면에서는 PNG 기반 좌표가 유일한 신뢰 수단.
- `showAttendance` / 출석 팝업은 `useEffect` 에서 한 틱 늦춰 마운트된다 (RN 0.76 Bridgeless Modal focus-steal 회피). 시나리오 timing 이 이에 의존.
- `adb shell input tap` 은 현재 포커스 윈도우에 이벤트를 보낸다. 다른 앱이 foreground 면 **그 앱** 에 전달되므로 실행 전 `am force-stop` 으로 방해 앱 정리 필수.
- 저장된 nickname (`useUserStore.nickname`) 이 있으면 login 스크린을 건너뛴다 → `03-lobby` 시나리오의 login-단계 탭이 의미 없이 lobby 에 입력되어 baseline 이 깨질 수 있다. 깨끗한 baseline 은 `pm clear com.tichu.app` 으로 초기화 후 재생성.

**ADB 위치 (자동 감지):** `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` / `$ANDROID_HOME` / `$ANDROID_SDK_ROOT`.

### 코드 컨벤션
- **언어:** TypeScript strict 모드, any 사용 금지
- **테스트:** vitest 사용. 족보 엔진은 단위 테스트 100% 커버리지 목표.
- **함수:** 순수 함수 우선. 게임 로직은 부수효과 없이 shared에서 검증 후 server에서 상태 변경.
- **네이밍:** camelCase (변수/함수), PascalCase (타입/인터페이스), UPPER_SNAKE_CASE (상수)
- **에러 처리:** 서버에서 유효하지 않은 플레이는 `invalid_play` 이벤트로 거부. 절대 크래시하지 않음.
- **주석:** 엣지 케이스 처리 시 CLAUDE.md 섹션 8의 케이스 번호를 주석에 명시 (예: `// Edge #11: 개만 남은 경우`)

### 구현 우선순위
1. `packages/shared` — 타입 정의 + 족보 검증 엔진 + 테스트
2. `packages/server` — 게임 엔진 + Socket.io + 봇
3. `packages/app` — UI + 소켓 연결 + 애니메이션

---

## 1. 프로젝트 개요

4인(2v2 팀전) 트릭테이킹 클라이밍 게임 '티츄'의 모바일 멀티플레이어 구현.

**기술 스택:** React Native + TypeScript (Expo SDK 52+), Zustand, socket.io-client, Reanimated 3, expo-av, expo-haptics, MMKV | Backend: Node.js + Socket.io, PostgreSQL + Prisma, Firebase Auth

---

## 2. 게임 규칙

### 2.1. 기본
- 4명이 2팀(마주 앉은 상대가 파트너), 목표 1,000점 선도달 팀 승리
- 각 라운드: 손패를 모두 먼저 소진하는 것이 목표

### 2.2. 카드 구성 (56장)
- **일반 52장:** 4문양(검/별/옥/탑) × 13장(2~A)
- **특수 4장:** 참새(1), 개(Dog), 봉황(Phoenix), 용(Dragon)
- **교환 시 특수 카드 포함 가능:** 참새, 개, 봉황, 용 모두 교환 대상에 포함
- 참새를 교환으로 넘기면 받은 플레이어가 첫 리드 의무를 갖는다

### 2.3. 서열
```
2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A
```
용은 싱글 최강. 특수 카드는 별도 규칙.

### 2.4. 특수 카드

#### 참새 (Mahjong/1)
- 값 1, 싱글 또는 1 포함 스트레이트에 사용
- 교환 완료 후 최종 보유자가 라운드 첫 리드 (참새 포함 의무 없음, 자유 리드)
- 낼 때 소원(Wish) 선언 가능 (2~A 중 택1, 선택사항)
- **소원 강제 (팔로우 시):** 소원 숫자의 **실제 일반 카드**를 보유한 플레이어는 현재 바닥 족보에 맞게 해당 숫자 포함 합법 조합이 있으면 반드시 제출. 봉황이 조합 구성을 보조하여 합법 플레이를 만들 수 있으면 그것도 강제. 단, 폭탄으로만 가능하면 면제.
  - **봉황의 소원 강제 기준:** 봉황은 소원 숫자를 "보유"한 것으로 치지 않는다. 전제조건은 핸드에 소원 숫자의 실제 일반 카드가 있는 것.
  - 예시: 소원=7, 핸드에 6+봉황+8+9+10 → 실제 7 미보유 → **강제 아님**
  - 예시: 소원=7, 핸드에 봉황+7+8+9+10 → 실제 7 보유 → 봉황을 6으로 대체한 스트레이트 가능 → **반드시 제출**
- **소원 강제 (리드 시):** 소원 숫자의 실제 카드를 보유하면 반드시 해당 숫자 포함 조합으로 리드. 패스 불가. 면제 없음. 이 경우 개(Dog) 리드도 불가.
- **소원 해제:** 해당 숫자 카드가 플레이되면 해제 (폭탄 포함). 라운드 종료 시 자동 해제.
- 이미 4장 모두 플레이된 숫자도 소원 선언 가능 (충족 불가 → 라운드 끝까지 유지)

#### 개 (Dog)
- 어떤 족보에도 불포함. **리드 시에만** 단독 사용
- 리드권을 파트너에게 이전. 파트너 나갔으면 **파트너 seat 기준 시계방향** 다음 활성 플레이어에게.
- 라운드 첫 리드에서도 사용 가능 (개 포함 모든 카드 허용)
- 소원 활성 + 소원 숫자 보유 시 리드 불가
- 0점, 폭탄으로 제압 불가 (트릭 미성립)
- **개만 남은 경우:** 팔로우 시 패스만 가능. 이후 리드권을 얻으면 개 리드로 나갈 수 있음. 리드권 못 얻으면 4등, 개(0점)는 상대팀 양도.

#### 봉황 (Phoenix)
- **싱글:** 직전 카드 값 +0.5 (리드 시 1.5). 용 위에는 불가. float 처리 (A 위 = 14.5).
- **조합:** 2~A 중 1장 와일드카드 대체. 페어/트리플/풀하우스/스트레이트/연속페어 사용 가능.
  - 풀하우스: 트리플/페어 어디든 대체 가능. value는 트리플 기준.
  - 연속페어: 어느 위치든 대체 가능. value는 가장 높은 페어 숫자.
  - 스트레이트: 참새(1)와 동시 사용 가능 (예: 1+봉황(2)+3+4+5)
- **제한:** 폭탄 구성 불가, 특수카드 대체 불가. 점수: **-25점**
- **마지막 카드:** 제출→나감. -25점 포함 트릭 획득. 4등 시 획득 트릭→1등에게 양도.

#### 용 (Dragon)
- 싱글 전용, 값 무한대. 조합 불포함
- 트릭 승리 시 카드 더미를 **상대팀 1명에게 양도** (플레이어 선택). 상대 모두 나갔으면 먼저 나간 상대(finishOrder 기준)의 wonTricks에 합산.
- **폭탄으로만 제압**. 점수: **+25점**
- **마지막 카드:** 나감 처리 + DRAGON_GIVE 선택. 타임아웃→랜덤 상대 자동 양도.

### 2.5. 족보 종류

| 족보 | 설명 | 최소장수 | 비교 |
|------|------|---------|------|
| 싱글 | 1장 | 1 | 높은 숫자 |
| 페어 | 같은 숫자 2장 | 2 | 높은 숫자 |
| 연속 페어(Steps) | 연속 숫자 페어 | 4(2쌍) | 같은 쌍수, 높은 값 |
| 트리플 | 같은 숫자 3장 | 3 | 높은 숫자 |
| 풀하우스 | 트리플+페어 | 5 | 트리플 부분 비교 |
| 스트레이트 | 연속 숫자 5장+ | 5 | 같은 장수, 최고값 비교 |

- 후속은 **같은 타입+같은 장수+더 높은 값** 또는 폭탄
- 참새(1)는 스트레이트 최솟값만. 페어/트리플/풀하우스/연속페어/폭탄 불포함
- A는 스트레이트 최상위만. 순환(A-2-3) 불가. 최대 14장(참새+봉황+2~A)

#### 폭탄
- **포카드:** 같은 숫자 4장. 높은 숫자 승.
- **스트레이트 플러시:** 같은 문양 연속 5장+. 모든 포카드보다 강. 장수→값 순 비교.
- 턴 외 인터럽트 가능 (BOMB_WINDOW). 팀 무관. 봉황 포함 시 불성립. 개에 폭탄 불가.

### 2.6. 점수

| 카드 | 점수 |
|------|------|
| 5 | +5 |
| 10, K | +10 |
| 용 | +25 |
| 봉황 | -25 |
| 그 외 | 0 |

라운드 총합 항상 100점.

**티츄 보너스:** 스몰 +100/-100, 라지 +200/-200. **[커스텀] 팀 내 1명만 선언 가능** (라지/스몰 무관, 선착순). 서버에서 팀원 `tichuDeclarations` 확인 후 거부.

---

## 3. 게임 진행 페이즈

### 3.1. 딜링
1. 셔플 후 8장씩 분배 → **라지 티츄 선언 기회** (8장만 본 상태)
2. 모두 응답 후 나머지 6장 추가 → 14장 완성
3. **스몰 티츄:** **본인이** 첫 카드 내기 전까지 선언 가능. 다른 플레이어가 이미 냈어도 무관.

### 3.2. 카드 교환
- 왼쪽 상대 1장, 파트너 1장, 오른쪽 상대 1장 (비공개)
- 특수 카드 포함 가능. 참새 교환 시 서버가 교환 후 참새 보유자 재탐색 → `currentTurn` 설정
- 타임아웃(30초) → 서버 랜덤 교환

### 3.3. 트릭 진행
1. 참새 보유자 첫 리드 (자유 리드 — 참새 포함 의무 없음, 개 포함 모든 카드 허용).
2. 후속: 같은 타입+장수+더 높은 값, 또는 패스
3. 패스는 트릭 내 영구 탈락 아님 (다음 차례 재참여 가능)
4. **트릭 종료:** 마지막 제출자 제외 전 활성 플레이어 연속 패스. 제출자 나갔으면 활성 전원 패스.
5. **폭탄 인터럽트:** 카드 제출 후 BOMB_WINDOW(3초). 상세는 섹션 4.3.
6. 2인만 남고 1인 패스 → 즉시 종료
7. 남은 2인 같은 팀 → 원투 피니시 확정, 즉시 라운드 종료

### 3.4. 라운드 종료 및 점수 정산

**종료:** 3인 나감 또는 1등+2등 같은 팀 (원투 피니시).

**원투 피니시 판정:** finishOrder의 1등과 2등이 같은 팀인지로 판정.

| 상황 | 처리 |
|------|------|
| 원투 피니시 | 해당 팀 200점, 상대 0점 |
| 일반 종료 | 4등 남은 핸드→상대팀. 4등 획득 트릭→**1등에게**. 나머지 자기 점수. |

**승리:** 누적 1,000점 이상 + 더 높은 팀. 동점→추가 라운드.

---

## 4. 상태 머신

### 4.1. 라운드 상태 흐름
```
WAITING_FOR_PLAYERS → DEALING_8 → LARGE_TICHU_WINDOW → DEALING_6 → PASSING → TRICK_PLAY → ROUND_END → SCORING → [DEALING_8 또는 GAME_OVER]
```

| 상태 | 진입 조건 | 전환 조건 |
|------|-----------|-----------|
| `WAITING_FOR_PLAYERS` | 방 생성 | 4인 참가 완료 |
| `DEALING_8` | 라운드 시작 | 분배 완료 → 자동 |
| `LARGE_TICHU_WINDOW` | 8장 분배 완료 | 4인 응답 (타임아웃 15초 → 자동 패스) |
| `DEALING_6` | 라지 티츄 종료 | 분배 완료 → 자동 |
| `PASSING` | 14장 완성 | 4인 교환 완료 (타임아웃 30초 → 랜덤 교환) |
| `TRICK_PLAY` | 교환 완료 | 3인 나감 또는 원투 피니시 → `ROUND_END` |
| `ROUND_END` | 종료 조건 충족 | 정산 완료 (5초 표시) |
| `SCORING` | 정산 완료 | <1000점 → `DEALING_8`, ≥1000점 → `GAME_OVER` |
| `GAME_OVER` | 승리 조건 충족 | 재경기/로비 복귀 |

### 4.2. 트릭 내부 상태
```
LEAD → FOLLOWING → (PLAY/PASS 반복) → [BOMB_WINDOW] → TRICK_WON → [DRAGON_GIVE] → LEAD
```

### 4.3. 폭탄 인터럽트 시스템

**폭탄 윈도우 흐름:**
```
카드 제출 → BOMB_WINDOW (3초) → 폭탄 없으면 정상 진행
                                → 폭탄 제출 → 새 BOMB_WINDOW (3초)
                                → 동시 복수 폭탄 → 가장 강한 것만 적용
```

**규칙:**
1. 모든 카드 제출 직후 BOMB_WINDOW(3초) 진입
2. 대상: 전 활성 플레이어 (패스한 자 포함, 방금 낸 플레이어 포함, **팀 무관**)
3. 현재 바닥보다 강한 폭탄만 제출 가능
4. 동시 제출 → 최강 폭탄만 적용, 나머지 핸드 복귀
5. 폭탄 적용 시 새 BOMB_WINDOW (재인터럽트 가능)
6. 폭탄 승자가 트릭 주도권 획득 + 턴 순서 재설정
7. 마지막 카드 제출 후 나감 + 폭탄 → 나감 번복 불가, 트릭 더미 귀속만 변경
8. **BOMB_WINDOW 중 턴 타이머 정지.** 해소 후 다음 턴 플레이어에게 풀 타이머 시작.

**서버 데이터:**
```typescript
interface BombWindow {
  windowId: number;
  startedAt: number;
  duration: number;               // 3000ms
  currentTopPlay: PlayedHand;
  pendingBombs: { seat: number; bomb: PlayedHand; cards: Card[] }[];
  excludedSeat: number;           // 방금 카드 낸 플레이어
  outPlayerSeat?: number;         // 제출 후 나간 플레이어
}
```

**해소 로직:** pendingBombs 비었으면 정상 진행. 있으면 최강 폭탄 선택, 나머지 핸드 복귀, 폭탄 적용 후 새 BOMB_WINDOW 시작. windowId로 만료 콜백 보호.

### 4.4. 턴 순서
- 좌석: 0(남), 1(동), 2(북), 3(서). 팀: (0,2) vs (1,3)
- 시계방향: 0→1→2→3→0. 나간 플레이어 스킵.

### 4.5. 트릭 종료 조건

마지막 제출자가 활성이면 `consecutivePasses >= activePlayers.length - 1`, 나갔으면 `>= activePlayers.length`. 나감 후 활성 플레이어 수 동적 재계산.

### 4.6. 원투 피니시 조기 감지

finishOrder에 2명 이상 && 1등+2등 같은 팀 → 트릭 종료 후 ROUND_END.

### 4.7. 턴 타임아웃 자동 처리

- **리드:** 패스 불가 → 자동 플레이. 소원 활성+소원 숫자 보유→소원 숫자 싱글. 그 외→가장 낮은 싱글.
- **팔로우:** 자동 패스.

---

## 5. 서버 아키텍처

### 5.1. 서버 권위 모델
모든 게임 로직 서버 실행/검증. 클라이언트는 입력+렌더링만.

### 5.2. GameRoom 핵심 데이터 모델

```typescript
interface GameRoom {
  roomId: string;
  phase: GamePhase;
  players: { [seat: number]: {
    playerId: string; nickname: string; socketId: string;
    connected: boolean; disconnectedAt?: number; isBot: boolean;
  }};
  teams: { team1: [0, 2]; team2: [1, 3] };
  hands: { [seat: number]: Card[] };
  pendingExchanges: { [seat: number]: {
    left: Card | null; partner: Card | null; right: Card | null
  } | null };
  currentTrick: {
    leadSeat: number;
    leadType: HandType | null;
    leadLength: number;
    plays: { seat: number; hand: PlayedHand }[];
    consecutivePasses: number;
    lastPlayedSeat: number;
  };
  tableCards: PlayedHand | null;
  wonTricks: { [seat: number]: Card[] };
  wish: Rank | null;
  tichuDeclarations: { [seat: number]: 'large' | 'small' | null };
  largeTichuResponses: { [seat: number]: boolean };
  finishOrder: number[];
  currentTurn: number;
  turnTimer: {
    startedAt: number; duration: number; turnId: number;
    timeoutHandle: any; pausedRemainingMs?: number;
  };
  scores: { team1: number; team2: number };
  roundScores: { team1: number; team2: number };
  roundHistory: TrickRecord[];
  dragonGivePending: { winningSeat: number; trickCards: Card[] } | null;
  roundNumber: number;
  settings: RoomSettings;
  bombWindow: BombWindow | null;
  bombWindowIdCounter: number;
}

interface RoomSettings {
  turnTimeLimit: number;            // 30000ms
  largeTichuTimeLimit: number;      // 15000ms
  exchangeTimeLimit: number;        // 30000ms
  dragonGiveTimeLimit: number;      // 15000ms
  wishSelectTimeLimit: number;      // 10000ms
  bombWindowDuration: number;       // 3000ms
  targetScore: number;              // 1000
  allowSpectators: boolean;
  botDifficulty: 'easy' | 'medium' | 'hard';
}
```

### 5.3. play_cards 처리 파이프라인

```
1.  기본 검증: phase=TRICK_PLAY? / bombWindow 없음? / currentTurn 일치? / 카드 보유?
2.  첫 리드 검증: 없음 (자유 리드 — 참새 포함 의무 없음, 개 허용)
3.  소원+개 리드 검증: 소원 활성 + 소원 숫자 보유 + 개 → 거부
4.  족보 검증: validateHand(cards) → null이면 거부
5.  바닥 비교: canBeat(tableCards, playedHand) → false면 거부
6.  소원 체크: (리드) 소원 숫자 실제 보유 + 미포함 → 거부
              (팔로우) 소원 숫자 실제 보유 + 미포함 + 포함 가능 합법 조합 존재 → 거부
7.  상태 업데이트: hands 제거, tableCards 갱신, trick 기록
8.  소원 해제: 제출 카드에 소원 숫자 포함 시 해제 (폭탄 무관)
9.  나감 처리: hands 비면 finishOrder 추가, 원투 체크, 3인 나감 체크
10. BOMB_WINDOW 시작 + 턴 타이머 정지
11. (해소 후) 턴 이전 + 새 타이머
12. 브로드캐스트
```

### 5.4. submit_bomb 파이프라인

```
1. 검증: phase=TRICK_PLAY? / bombWindow 활성? / 카드 보유?
2. 폭탄 검증: validateHand → 폭탄 타입?
3. canBeat(bombWindow.currentTopPlay, bomb)?
4. 핸드 임시 제거 + pendingBombs 추가
5. 소원 해제 체크
6. (타임아웃 시 resolveBombWindow에서 최종 처리)
```

### 5.5. declare_tichu 처리

```
1. 페이즈 검증: large→LARGE_TICHU_WINDOW, small→TRICK_PLAY|PASSING
2. 스몰: 본인이 카드 낸 적 있으면 거부 (다른 플레이어 무관)
3. 본인 중복 거부
4. [커스텀] 팀원(seat+2%4) 선언 확인 → 있으면 거부
5. 적용 + 브로드캐스트
```

### 5.6. 정보 가시성 필터링

- myHand: 내 카드만 전체 공개
- otherHandCounts: 타인은 장수만
- tableCards, currentTrick, wish, tichuDeclarations, finishOrder, scores: 공개
- wonTrickSummary: 획득더미 요약만 (count, points)
- canDeclareTichu: 본인 미선언 + 팀원 미선언 + 본인 미플레이
- bombWindow: remainingMs + canSubmitBomb (폭탄 보유 여부)

### 5.7. 동시성 처리

- 폭탄: windowId로 동일 윈도우 보장
- 타임아웃: turnId/windowId incrementing counter
- BOMB_WINDOW 진입 시 clearTimeout → 해소 후 새 턴 타이머 (풀 타이머)
- 용 양도/소원 모달: 각각 timerId로 보호

### 5.8. 교환 후 첫 리드 결정

교환 완료 후 참새 보유자 탐색 → currentTurn 설정. PASSING → TRICK_PLAY 전환 시 호출.

---

## 6. 소켓 통신 프로토콜

### 6.1. 클라이언트 → 서버

| 이벤트 | 페이로드 |
|--------|----------|
| `join_room` | `{ roomId, playerId, nickname }` |
| `rejoin_room` | `{ roomId, playerId, sessionToken }` |
| `declare_tichu` | `{ type: 'large'\|'small' }` |
| `pass_tichu` | `{}` |
| `exchange_cards` | `{ left: Card, partner: Card, right: Card }` |
| `play_cards` | `{ cards: Card[], phoenixAs?: Rank, wish?: Rank }` |
| `pass_turn` | `{}` |
| `dragon_give` | `{ targetSeat: number }` |
| `submit_bomb` | `{ cards: Card[] }` |

### 6.2. 서버 → 클라이언트

`room_joined`, `game_state_sync`(재접속 스냅샷), `state_delta`, `cards_dealt`, `large_tichu_prompt`, `exchange_prompt`, `exchange_received`, `your_turn`(+유효 플레이 힌트), `card_played`(seat, hand, remainingCards), `player_passed`, `trick_won`(winningSeat, cards, points), `player_finished`(seat, rank), `round_result`, `game_over`, `invalid_play`(reason), `wish_active`/`wish_fulfilled`, `dragon_give_required`, `player_disconnected`/`player_reconnected`/`bot_replaced`, `tichu_declared`, `bomb_window_start`(remainingMs, canSubmitBomb), `bomb_window_end`, `bomb_played`(seat, bomb), `one_two_finish`, `auto_action`(seat, action, cards?)

### 6.3. 델타 vs 스냅샷
- **스냅샷:** 재접속/방 참가 시 1회
- **델타:** 일반 진행 중 변경분만
- **개별 이벤트:** card_played, trick_won, bomb_played 등은 애니메이션/햅틱 트리거용

### 6.4. 공통 타입

```typescript
type Suit = 'sword' | 'star' | 'jade' | 'pagoda';
type SpecialType = 'mahjong' | 'dog' | 'phoenix' | 'dragon';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A';

interface NormalCard { type: 'normal'; suit: Suit; rank: Rank; value: number; }
interface SpecialCard { type: 'special'; specialType: SpecialType; }
type Card = NormalCard | SpecialCard;

type HandType = 'single'|'pair'|'steps'|'triple'|'fullhouse'|'straight'|'four_bomb'|'straight_flush_bomb';

interface PlayedHand {
  type: HandType;
  cards: Card[];
  value: number;      // 비교 기준값. 봉황 싱글 시 float (예: 14.5)
  length: number;     // 카드 장수
  // 폭탄 비교: type으로 구분 (SF > 포카드). 같은 타입이면:
  //   four_bomb: value = rank 값 (2~14). 높은 value 승.
  //   straight_flush_bomb: length 먼저 비교 (긴 쪽 승), 같으면 value (최고 카드 값) 비교.
}

type GamePhase = 'WAITING_FOR_PLAYERS'|'DEALING_8'|'LARGE_TICHU_WINDOW'|'DEALING_6'|'PASSING'|'TRICK_PLAY'|'ROUND_END'|'SCORING'|'GAME_OVER';
type TrickPhase = 'LEAD'|'FOLLOWING'|'BOMB_WINDOW'|'TRICK_WON'|'DRAGON_GIVE';
```

---

## 7. 족보 검증 로직

### 7.1. 핵심 함수

```typescript
function validateHand(cards: Card[], phoenixAs?: Rank): PlayedHand | null;
function canBeat(current: PlayedHand | null, played: PlayedHand): boolean;
function getValidPlays(hand: Card[], currentTable: PlayedHand | null, wish: Rank | null): PlayedHand[];
function mustFulfillWish(hand: Card[], currentTable: PlayedHand | null, wish: Rank, isLead: boolean): { mustPlay: boolean; validPlaysWithWish: PlayedHand[] };
function getAvailableBombs(hand: Card[], currentTable: PlayedHand): PlayedHand[];
```

### 7.2. validateHand 로직

```
1. 특수 카드 단독: [용]→Single(∞), [개]→리드시만, [참새]→Single(1), [봉황]→Single(float)
2. 장수별: 1→싱글, 2→페어, 3→트리플, 4→포카드/연속페어(2쌍), 5→SF/풀하우스/스트레이트/연속페어, 6+→SF/스트레이트/연속페어
3. 봉황: phoenixAs로 대체. 대체 후 폭탄→무효. 싱글=float. 풀하우스 양쪽 가능. 연속페어 어디든. 스트레이트에서 참새와 동시 가능.
4. 폭탄: 봉황 미포함. 포카드=같은숫자4장. SF=같은문양 연속5장+(특수카드 불포함).
5. 스트레이트: A 최상위만(순환 불가). 참새 최하위만. 최대 14장.
```

### 7.3. canBeat 로직

```
1. current=null(리드) → true
2. played 폭탄: current 비폭탄→true. 포카드 vs SF→SF 승. 같은 타입→포카드:값, SF:장수→값.
3. played 비폭탄: current 폭탄→false. 타입/장수 불일치→false. value > current.value→true (float 비교)
```

### 7.4. 소원 강제 판정

```
[전제] 소원 숫자 "보유" = 핸드에 해당 숫자의 실제 일반 카드. 봉황만으로는 미보유.

[팔로우] 실제 보유? → 바닥 족보 맞는 합법 조합? (봉황 보조 포함) → 폭탄만 가능→면제 → 합법 있으면 강제
[리드] 실제 보유? → 반드시 포함 리드 (개 불가). 미보유→자유 리드.
[해제] 해당 숫자 플레이 시 (폭탄 포함). 제출 직후 해제.
```

### 7.5. getValidPlays 조합 생성

- **싱글:** 각 카드 + 특수카드
- **페어:** 같은 숫자 C(n,2) + 봉황 페어
- **트리플:** 같은 숫자 3장+ + 봉황 트리플
- **풀하우스:** 트리플×페어 (봉황 양쪽 시도)
- **스트레이트:** 슬라이딩 윈도우, A 끝점만, 참새 시작점만, 빈자리→봉황, 최대 14장
- **연속페어:** 2부터, 봉황 대체 전 위치, value=최고 페어 숫자
- **포카드/SF:** 봉황/특수카드 불포함, A 순환 불가

바닥 있으면 canBeat()으로 필터.

### 7.6. getAvailableBombs

BOMB_WINDOW용. 핸드에서 currentTable보다 강한 모든 폭탄 반환.

---

## 8. 엣지 케이스

### 8.1. 특수 카드

| # | 상황 | 처리 |
|---|------|------|
| 1 | 파트너 나간 상태에서 개 | 파트너 seat 기준 시계방향 다음 활성 플레이어에게 리드 이전 |
| 2 | 봉황 리드 단독 | 값 1.5, 2이상으로 제압 가능 |
| 3 | 봉황 싱글, 직전=참새(1) | 값=1.5 (가능) |
| 4 | 봉황 싱글, 직전=용 | 불가 (폭탄으로만) |
| 5 | 용 트릭, 양도 대상 나감 | 남은 상대에게 |
| 6 | 용 트릭, 상대 모두 나감 | 먼저 나간 상대(finishOrder)의 wonTricks에 합산 |
| 7 | 마지막 카드=개 | 리드권 이전 후 나감 |
| 8 | 봉황+SF 시도 | 무효 |
| 9 | 참새 포함 스트레이트로 소원 | 가능 |
| 10 | 개에 폭탄 시도 | 불가 (트릭 미성립) |
| 11 | 개만 남음 | 팔로우→패스. 리드권 얻으면 개 리드 가능. 못 얻으면 4등. |
| 12 | 용 마지막 카드 | 나감 + DRAGON_GIVE (타임아웃→랜덤 상대) |
| 13 | 봉황 싱글, 직전=A(14) | 값=14.5, 용/폭탄으로만 제압 |
| 14 | 봉황 마지막 카드 | 나감. -25점 트릭 획득. 4등 시 1등에게 양도. |
| 15 | 첫 리드에서 개 | 허용 (자유 리드) |
| 16 | 참새 교환 후 | 받은 플레이어가 첫 리드 |
| 17 | 소원+소원숫자보유+개 리드 | 서버 거부 |

### 8.2. 소원

| # | 상황 | 처리 |
|---|------|------|
| 18 | 봉황 보조로 소원 충족 가능 | 실제 소원 카드 보유 + 봉황 보조 합법 조합 → 강제 |
| 19 | 폭탄으로만 소원 가능 | 면제 |
| 20 | 리드 시 소원+소원숫자 | 반드시 포함 리드. 면제 없음. |
| 21 | 바닥=스트레이트, 소원 포함 가능 | 같은 장수 더 높은 것으로 반드시 제출 |
| 22 | 소원 숫자 있지만 바닥 불가 | 패스 가능, 소원 유지 |
| 23 | 라운드 끝까지 미충족 | 자동 해제 |
| 24 | 4장 모두 플레이된 숫자로 소원 | 선언 가능. 충족 불가→라운드 끝 자동 해제 |
| 25 | 폭탄으로 소원 숫자 포함 | 해제 |
| 26 | 봉황만 보유, 소원 숫자 미보유 | 자유 선택 (강제 아님) |
| 27 | 소원+소원숫자+개 리드 | 서버 거부 |

### 8.3. 폭탄 인터럽트

| # | 상황 | 처리 |
|---|------|------|
| 28 | 패스 직후 폭탄 | 가능 |
| 29 | 동시 복수 폭탄 | 최강만 적용, 나머지 복귀 |
| 30 | 폭탄에 폭탄 | 가능. 새 BOMB_WINDOW |
| 31 | 폭탄 승리 후 나감 | 나감 + 리드 전환 |
| 32 | 폭탄 + 용 | 용 위 폭탄 가능. 용 양도 미발생 |
| 33 | 팀원에게 폭탄 | 허용. 팀 무관 |
| 34 | 나감 + BOMB_WINDOW 폭탄 | 나감 번복 불가. 트릭 귀속만 변경 |
| 35 | BOMB_WINDOW 중 타이머 | 턴 타이머 정지. 해소 후 풀 타이머 |

### 8.4. 라운드/게임

| # | 상황 | 처리 |
|---|------|------|
| 36 | 원투 피니시 | 같은 팀 1등+2등 → 200점, 상대 0점 |
| 37 | 양팀 동시 1000점 | 높은 팀 승리. 동점→추가 라운드 |
| 38 | 팀원 티츄 + 본인 시도 | 서버 거부 (teammate_already_declared) |
| 38a | 동시 라지 티츄 | 먼저 도착만 수락 |
| 38b | 팀원 라지→본인 스몰 | 서버 거부 |
| 39 | 라지 티츄 선언자 ≠ 첫 리드 | 정상 |
| 40 | 1등 나감 뒤 트릭 | 1등 획득더미에 추가 |
| 41 | 4등 정산 | 남은패→상대, 획득트릭→1등 |
| 42 | 2인 남고 1인 패스 | 트릭 종료 |
| 43 | 남은 2인 같은 팀 | 1등+2등 같은 팀이면 원투, 아니면 일반 종료 |
| 44 | A 순환 스트레이트 | 서버 거부 |
| 45 | 리드 타임아웃 | 자동 플레이 (참새/소원숫자/최저 싱글) |
| 46 | 팔로우 타임아웃 | 자동 패스 |

### 8.5. 트릭 종료

| # | 상황 | 처리 |
|---|------|------|
| 47 | 3인, A 나감, B패스, C패스 | 종료 |
| 48 | 4인, A 제출, B/C/D 패스 | 종료 |
| 49 | 3인, A→B패스→C제출→A패스→B패스 | 종료 (C 기준) |

### 8.6. 네트워크

| # | 상황 | 처리 |
|---|------|------|
| 50 | 제출 후 끊김 | 서버 유효, 재접속 동기화 |
| 51 | 타이머+동시 입력 | turnId 체크 |
| 52 | 교환 중 끊김 | 타임아웃→랜덤 교환 |
| 53 | 라지 티츄 중 끊김 | 타임아웃→자동 패스 |
| 54 | 2인+ 동시 끊김 | 60초 대기→봇 대체 |
| 55 | BOMB_WINDOW 중 끊김 | 폭탄 미제출, 윈도우 진행 |
| 56 | DRAGON_GIVE 중 끊김 | 타임아웃→랜덤 양도 |
| 57 | 소원 선택 중 끊김 | 타임아웃→소원 안 함 |

---

## 자동화

현재 repo 에 실제로 존재하는 자동화 전부. 추측 없이 파일 기반으로만 작성.

### 1. Git pre-commit hook — RN 크래시 패턴 차단

- **무엇을 하는지:** `packages/app/{src,app}/**/*.{ts,tsx}` 중 스테이징된 파일을 TypeScript AST 로 walk 해서 **모듈 최상위** 에서 호출되는 Web 전용 API (`window.addEventListener`, `document.*`, `localStorage.*`, `speechSynthesis.*`, `navigator.clipboard.*`, `new AudioContext()` 등) 를 차단. 2026-04-13 에 `sound.ts` 의 top-level `window.addEventListener` 가 RN Bridgeless 에서 TypeError 를 던져 흰 화면을 만든 사건 이후 회귀 방지용으로 도입.
- **어떻게 실행되는지:** `git commit` 시 자동. 일회성 셋업 한 번만 필요 — `sh scripts/install-git-hooks.sh` 로 `git config core.hooksPath .githooks` 를 적용. 수동 검사는 `node packages/app/scripts/lint-rn-safety.mjs <files...>` 또는 인자 없이 실행해 `packages/app/{src,app}/**/*.{ts,tsx}` 전부 스캔.
- **관련 파일:**
  - `scripts/install-git-hooks.sh` — 한 번만 실행하는 훅 설치 스크립트
  - `.githooks/pre-commit` — 스테이징 파일 필터링 + linter 호출
  - `packages/app/scripts/lint-rn-safety.mjs` — 실제 AST linter (DANGEROUS_CALLS / DANGEROUS_RECEIVERS / DANGEROUS_NEWS 세트 관리)

### 2. `npm run android:dev` — EAS 없는 Android 개발 사이클

- **무엇을 하는지:** (1) `expo export --platform android` 로 Hermes bytecode 생성 → (2) 기존 base APK (`packages/app/.android-dev/base.apk`, 이전 EAS 빌드 산출물) 를 "shell" 로 두고 `assets/index.android.bundle` 만 교체 → (3) `zipalign` + `apksigner` 로 debug 키 서명 → (4) ADB 로 install + launch → (5) `screencap` + `logcat` 캡처 → (6) logcat 에서 `ReactNativeJS` 에러 자동 추출. 한 사이클 ≈ 30~60 초, EAS quota 0 사용.
- **어떻게 실행:** `cd packages/app && npm run android:dev`. 옵션: `WAIT_MS=12000 npm run android:dev` (첫 페인트 대기 연장), `SKIP_INSTALL=1 npm run android:dev` (APK 만 만들고 설치 생략). 네이티브 의존성이 바뀌면 base APK 재생성 필요 — 새 EAS 빌드 후 `.android-dev/base.apk` 로 복사.
- **관련 파일:**
  - `packages/app/scripts/android-dev.mjs` — 빌드 파이프라인 본체
  - `packages/app/scripts/README.md` — 셋업/트러블슈팅 가이드
  - `packages/app/.android-dev/base.apk` — base APK (gitignored)
  - `packages/app/.android-dev/screenshots/` — 매 실행 스크린샷 (타임스탬프)
  - `packages/app/.android-dev/logs/` — 매 실행 logcat

### 3. `npm run android:visual` — 시나리오 기반 visual regression

- **무엇을 하는지:** 이미 설치된 APK 를 launch → 시나리오마다 `tap` / `text` / `keyevent` step 수행 → 스크린샷 캡처 → pixelmatch 로 `visual-tests/baselines/<scenario>.png` 대비 diff 계산 (`includeAA:false`, `threshold:0.1`, 상단 100px 마스킹해서 시계/배터리 변화 무시) → `DIFF_TOLERANCE_PCT=0.1` 이내면 pass. Samsung One UI 의 status bar 안정화 위해 실행 전후로 `systemui demo` 브로드캐스트로 시계/배터리/네트워크 pin. 현재 정의된 시나리오: `01-splash`, `02-login`, `03-lobby`, `04-custom-match`.
- **어떻게 실행:** `cd packages/app && npm run android:visual` (전체). 옵션: `-- --filter lobby` (시나리오 이름 부분일치), `-- --update-baselines` / `-u` (현재 캡처를 새 baseline 으로 채택). 종료 코드: fail 한 시나리오 개수.
- **관련 파일:**
  - `packages/app/scripts/visual-test.mjs` — 러너 + `SCENARIOS` 배열 (tap 좌표는 2340x1080 landscape 기준, 디바이스마다 재튜닝 필요)
  - `packages/app/visual-tests/baselines/` — 커밋된 정답 이미지 (현재 `01-splash.png`, `02-login.png`, `03-lobby.png`)
  - `packages/app/visual-tests/current/` — 매 실행 캡처 + `.diff.png` (gitignored)

### 4. GitHub Actions CI — `.github/workflows/ci.yml`

- **무엇을 하는지:** `master` 로의 push/PR 에서 순차 실행:
  1. `test-shared` — `npm run build -w packages/shared` + `npm test -w packages/shared` (vitest)
  2. `test-server` — shared 빌드 + `prisma generate` + vitest (단, `socket-sim.test.ts` 와 `socket-sim-100.test.ts` 는 CI 자원 초과로 제외)
  3. `typecheck-app` — shared 빌드 + `cd packages/app && npx tsc --noEmit`
  4. `build` — shared + prisma + `npm run build -w packages/server` (test-server / typecheck-app 의존)
- **어떻게 실행:** GitHub 가 자동. 로컬 재현은 각 job 의 명령을 개별 실행.
- **관련 파일:** `.github/workflows/ci.yml`

### 5. 루트 workspace 스크립트 — `package.json`

- **무엇을 하는지:** 모노레포 워크스페이스 위임 + `postinstall` 에서 `packages/shared` 자동 빌드 (shared 가 app/server 양쪽에 static dependency 라 설치 직후 빌드 안 돼 있으면 이후 명령들이 전부 터진다).
- **어떻게 실행:**
  - `npm install` — 자동 postinstall 로 shared 빌드
  - `npm run build:shared` / `npm run test:shared`
  - `npm run dev:server` / `npm run test:server`
  - `npm test` — 모든 워크스페이스 `test --if-present`
- **관련 파일:** `package.json` (루트)

### 6. 패키지별 개발/테스트 스크립트

- **`packages/shared`:** `build` (tsc), `test` (vitest run), `test:watch` (vitest)
- **`packages/server`:** `dev` (tsx watch src/index.ts), `build` (prisma generate + tsc), `start` (prisma db push + node dist), `test` (vitest run)
- **`packages/app`:** `start` (expo), `android` (expo run:android), `ios` (expo run:ios), `typecheck` (tsc --noEmit), `build` (expo export web), 그리고 위 #2·#3 의 `android:dev`·`android:visual`
- **관련 파일:** 각 `packages/*/package.json`

### 이 repo 에 **없는** 것 (혼동 방지)

- Husky / lint-staged — 훅은 `.githooks/` + `core.hooksPath` 로 직접 관리
- Makefile — 루트에 없음 (`node_modules` 안 말고)
- Prettier / ESLint 자동화 훅 — pre-commit 은 RN safety 만 실행
- 자동 배포 워크플로우 — CI 는 test/build 까지만, 배포는 Railway 의 GitHub 연동이 별도로 처리