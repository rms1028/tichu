# Custom Match — 풀스크린 리디자인 + 2차 정제

**브랜치**: `feat/custom-match-fullscreen`
**상태**: ✅ **모든 Phase 완료 — 출시 준비 단계**

---

## 1차 작업 (풀스크린 페이지로 모달 교체)

이전 자율 세션에서 완료. 6개 Phase (디자인 토큰 → 골격 → 좌측 목록 → 우측 패널 → 모바일 시트 → 모달 제거).

| Phase | 커밋 |
|---|---|
| 1. 디자인 토큰 + expo-blur/linear-gradient | `ba33880` |
| 2. 페이지 골격 + 라우팅 + 반응형 기반 | `52cbe6f` |
| 3. 좌측 방 목록 (헤더/필터/카드) | `f6798e8` |
| 4. 우측 상세 패널 (탭) | `91e81bc` |
| 5. 모바일 시트 + 비밀번호 모달 + 인터랙션 | `6033f7b` |
| 6. 기존 LobbyScreen 모달 제거 | `55a0665` |
| 6.5. 1차 PROGRESS 업데이트 | `f1549f7` |

## 흰 화면 디버깅 (사이 작업)

별도 사이클로 진행됨 (custom match 와 무관한 native 버그):

| 커밋 | 내용 |
|---|---|
| `d9902fb` | firebase lazy + ErrorBoundary 도입 |
| `cf73a6f` | Railway postinstall inline 화 (Dockerfile 호환) |
| `c2e9fa8` | 진단용 단순 빌드 |
| `d9969e0` | **bgm.ts window.addEventListener 가드 + MMKV lazy** ← 진짜 fix |

흰 화면 진단 결과: `bgm.ts:40` 에서 `setupInteractionListener()` 가 module load 시점에 호출되는데, `typeof window === 'undefined'` 가드가 RN 0.76+ 에서 실패해서 `window.addEventListener` 호출 시 TypeError → 모듈 로드 실패 → ErrorBoundary 가 mount 되기도 전에 흰 화면.

병렬로 react-native-mmkv v3 module-load init 도 lazy 화 (TurboModule native 실패 시 try/catch 가 못 잡는 문제 예방).

---

## 2차 작업 (실제 출시용 정제)

### Phase 1~4 (한 번에 묶음): 정리 + 동작 변경 + 빈상태 + 모달
**커밋**: `566f1f5`

화면 방향성 전환: "정보 풍부한 화려한 로비" → "사용자가 빠르게 방 찾고 입장하는 도구".

**제거**:
- 랭크 모드 (`mode` 필드, '일반/랭크' 칩, 뱃지) — 커스텀에는 랭크 없음
- 모든 mock 데이터 함수 (`generateMockRooms`, `pingQuality`, deterministic hash, host 닉네임/아바타 풀)
- 우측 상세 패널 + 탭 전체 (`RightPanel`, `RoomInfoTab`, `RoomCreateTab`, `TeamBox`, `InfoCell`)
- mock 전용 필드 표시: `players[]`, `team`, `host.level`, `host.rating`, `host.avatarChar`, `ping`, `spectatorCount`
- 방 카드 우측의 '입장' 미니 버튼 (카드 전체가 입장 트리거)
- 영문 "Custom Match" 큰 타이틀 (한글 "커스텀 매치" 만)
- 브레드크럼 "HOME / PLAY / CUSTOM MATCH"

**`Room` 타입 단순화** (`roomDataAdapter.ts`):
```ts
interface Room {
  // 서버가 이미 보내는 것
  roomId: string; roomName: string; playerCount: number; hasPassword: boolean;
  // 서버 확장 필요 (TODO: server) — 일단 optional
  hostName?: string; hostId?: string;
  scoreLimit?: 500|1000|1500;
  turnTimer?: number|null;
  allowSpectators?: boolean;
  createdAt?: number;
}
```
optional 필드는 있을 때만 표시, 없으면 생략. mock 으로 채우지 않음.

**카드 동작**:
- `Pressable` 전체가 클릭 영역
- 클릭 흐름: 비번 없음 → 즉시 onJoin / 비번 있음 → 비번 모달 / 풀방 → 비활성 + 토스트 + 강제 새로고침
- pressed 상태에 골드 글로우
- 슬롯 표시: `■■■□ 3/4` (풀방은 회색 + `4/4 FULL` + 카드 dim)

**빈 상태**:
- 큰 🎴 + "아직 대기중인 방이 없어요" + 큰 골드 CTA `+ 방 만들기`
- 필터로 0개일 때와 진짜 0개일 때 메시지 분리

**로딩**:
- 첫 진입: 4개 펄스 스켈레톤 카드
- 새로고침 버튼: 360° 회전 애니메이션
- 자동 갱신 표시: 녹색 점 + "자동" 텍스트 (데스크톱)

**방 만들기 모달**:
- 데스크톱: 중앙 모달 (maxWidth 440)
- 모바일: 풀스크린 슬라이드업 시트 + KeyboardAvoidingView
- 좋은 기본값: `{닉네임}의 방` / 1000점 / 30s / 관전 ON
- 검증: 이름 1~20자, 비번 4~20자 (선택)
- 글자수 카운터 + 인라인 에러

**비밀번호 모달**:
- 인라인 에러 슬롯
- 시도 횟수/blockedUntil state 준비됨 (서버가 invalid_play 등으로 알려주면 연결)
- ESC/취소/Enter 모두 지원

**기타**:
- 토스트 시스템 (race condition 알림용)
- 정렬 옵션 3개 (최신순/빈자리 많은 순/곧 시작)
- 내 방 표시 (`hostId === savedPlayerId` 일 때 골드 뱃지 + 좌측 액센트 + 항상 맨 위)

### Phase 7: 키보드 단축키 (PC 웹 전용)
**커밋**: `b8999d3`
- ESC: 모달 닫기 → 비번 모달 닫기 → 뒤로 가기 (3-단계 우선순위)
- `/` 또는 Ctrl/Cmd+F: 검색 input focus
- `n`: 방 만들기 모달 열기
- 입력 필드 안에서는 ESC 외 비활성
- `Platform.OS === 'web'` 가드 + window.addEventListener('keydown') + cleanup
- 방향키 카드 포커스 이동은 복잡도 대비 이득 작아 생략

### Phase 5/6: 디테일/모바일
이미 Phase 1~4 한 파일 재작성 안에 통합되어 있음:
- 한글 타이틀, 브레드크럼 제거 (Phase 1~4)
- 내 방 표시, 정렬, 코인 유지 (Phase 1~4)
- 모바일 분기는 전체 컴포넌트가 `isMobile` 분기로 작성됨 — 카드 세로 배치, FAB 스타일 만들기 버튼, 풀스크린 시트 등

### Phase 8: 출시 점검 (이 파일)

---

## 최종 검증

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx -y expo-doctor` | ✅ 17/17 |
| mock 함수/import grep | ✅ 0 (deleted) |
| 우측 패널 컴포넌트 grep | ✅ 0 (deleted) |
| 다른 화면 회귀 위험 | ✅ 없음 (`useSocket` 시그니처 불변, `LobbyScreen` 만 수정, theme 기존 토큰 불변) |
| 반응형 분기 (desktop/tablet/mobile) | ✅ 단일 컬럼 + maxWidth 1100, 모바일 패딩/폰트 축소, 만들기 버튼 FAB 화 |

---

## 🚨 출시 전 필수 — 서버 측 작업 (코드 변경 필요)

다음은 **클라이언트 단독으로 못 끝내는 항목**이고, 출시 전 반드시 처리해야 합니다.

### S1. `room_list` 응답 확장 (`packages/server/src/socket-handlers.ts:441-464`)
현재 응답:
```ts
{ roomId, roomName, playerCount, hasPassword }
```
추가 필요한 필드 (이미 클라이언트는 optional 로 받을 준비 완료):
```ts
hostName?: string;          // room.players[seat].nickname (방장 좌석)
hostId?: string;            // room.players[seat].playerId
scoreLimit?: 500|1000|1500; // room.settings.targetScore
turnTimer?: number|null;    // room.settings.turnTimeLimit / 1000, 0 → null
allowSpectators?: boolean;  // room.settings.allowSpectators
createdAt?: number;         // room.createdAt (이 필드도 GameRoom 에 추가 필요)
```
**왜 필요한가**: 클라이언트가 host 표시, 정렬, 내 방 판정, 메타 정보 표시를 정확히 하기 위함. 이게 없으면 화면이 비어 보임.

### S2. `create_custom_room` 요청 페이로드 확장
현재 시그니처:
```ts
onCreateCustomRoom(roomName, password, playerId, nickname)
```
클라이언트는 이미 더 많은 정보를 폼으로 받지만 (scoreLimit, turnTimer, allowSpectators), 서버 API 가 받지 않아 전송 못 함. 폼이 무용지물이 되지 않게 다음 시그니처로 확장:
```ts
onCreateCustomRoom({
  roomName, password,
  scoreLimit, turnTimer, allowSpectators,
}, playerId, nickname)
```
서버 측: `socket.on('create_custom_room', ...)` 에서 `room.settings` 에 반영.
**왜 필요한가**: 사용자가 방 만들 때 점수 한도/타이머/관전 옵션을 선택할 수 있어야 의미가 있음.

### S3. 방장 떠나기 처리 검증
서버 코드 (`socket-handlers.ts:1626 disconnect`, `1580 leaveRoom`) 가 이미 처리 중이지만, 다음 케이스를 명시적으로 확인:
- 방장이 `WAITING_FOR_PLAYERS` 상태에서 떠나면 → 다음 사람이 방장? 방 폐쇄?
- 게임 진행 중 방장 disconnect → 봇 대체? 방 유지?
- 현재 동작이 이 둘 중 어느 쪽이든 의도된 동작인지 확인 필요.

### S4. 동시 입장 (race condition) 거절 응답
클라이언트는 `playerCount >= 4` 거절을 토스트로 표시. 서버가 이미 거절 메시지를 보내는지 확인:
- 4명이 차 있는 상태에서 `join_room` 요청 → `invalid_play` 또는 `join_failed` event 송신?
- 클라이언트가 그 응답을 받아 토스트를 띄우는 흐름이 useSocket 에 연결되어 있는지 확인 필요.

---

## ✅ 출시 전 점검 체크리스트 (코드 변경 없는 항목)

| 항목 | 현재 상태 | 비고 |
|---|---|---|
| 방장이 나가면 방 처리 | ⚠️ **확인 필요** | 위 S3 |
| 게임 중 연결 끊김 → 재접속 | ✅ 구현됨 | `socket-handlers.ts:984` `disconnectedAt` 클리어 + `attemptRejoin` |
| 신고 기능 | ✅ 있음 | `report_user` 핸들러 (`socket-handlers.ts:1588`) |
| 차단 사용자 방 숨김 | ❌ **없음** | `block_user` 는 있지만 `room_list` 에서 차단된 host 의 방 필터링 없음. 출시 전 추가 권장 |
| 점검 모드 표시 | ❌ **없음** | 서버 점검 시 클라가 어떤 화면을 띄울지 미정의. 출시 후 가능 |
| 클라/서버 버전 미스매치 | ✅ 있음 | `check_version` 핸들러 + `forceUpdate` 화면 (`gameStore.forceUpdate`) |
| 분석 이벤트 | ❌ **없음** | 방 생성/입장/실패 추적 안 됨. 출시 후 가능 (Firebase Analytics 등) |

### 출시 차단 (출시 전 반드시)
- [ ] **S1**: `room_list` 응답에 hostName, hostId, scoreLimit, turnTimer, allowSpectators, createdAt 추가
- [ ] **S2**: `create_custom_room` 시그니처 확장 + 클라이언트 useSocket 연결
- [ ] **S3**: 방장 disconnect/leave 동작 확인 및 의도대로 동작하는지 검증
- [ ] **S4**: 풀방 입장 거절 시 클라이언트로 명확한 에러 송신 확인

### 출시 전 권장 (있으면 좋음)
- [ ] 차단 사용자가 만든 방을 `room_list` 에서 필터링 (서버 또는 클라이언트)

### 출시 후 가능 (블록 아님)
- [ ] 점검 모드 표시
- [ ] 분석 이벤트 (Firebase Analytics)
- [ ] 키보드 단축키 화살표 포커스 이동
- [ ] Cinzel/Noto Sans KR 정식 폰트 설치

---

## 3차 작업 (빈 상태 + 디테일 정리)

UI 정제 4 phase. `CustomMatchScreen.tsx` 한 파일 안에서만 작업.

| Phase | 커밋 | 내용 |
|---|---|---|
| 1. 에셋 교체 | `e588e05` | 한자 배경 → `BackgroundWatermark`(splash.png) 재사용. 깨진 🎴 placeholder → `CardView` Dragon large + 골드 shadow. `LayoutAnimation` 준비. |
| 2. 빈 상태 마무리 | `812b381` | `isEmpty` 계산. 빈 상태일 때 카운터 / 우상단 만들기 버튼 / 필터 바 전체 숨김(조건부 렌더링). 로딩→빈→리스트 전환 `LayoutAnimation.easeInEaseOut`. |
| 3. 필터 바 정리 | `93442e7` | 토글(빈자리만 / 비밀방 제외)과 정렬(최신순 / 빈자리 많은 순 / 곧 시작) 사이 세로 구분선. 정렬 칩에 ↕ 아이콘. 검색 placeholder → `방 이름 검색`. 자동 갱신 `🟢 자동` 제거 → 새로고침 버튼 우상단 코너 초록 점. |
| 4. 디테일 | (아래) | 골드 액센트 바 30px + 모바일 24px 변형. `roomsContent.paddingBottom` 20 → 90 (OS 바 회피). |

**Phase 4 변경 파일**: `packages/app/src/screens/CustomMatchScreen.tsx`
- `titleAccent`: height 28 → 30
- `titleAccentMobile` 추가: width 5, height 24 (모바일 타이틀 22px와 균형)
- `roomsContent.paddingBottom`: 20 → 90

**검증**:
- `npx tsc --noEmit`: 0 errors
- `npx expo-doctor`: 17/17

**의도적으로 스킵**:
- 변경 6 (빈 상태 메시지 미세 조정) — 현재 문구가 충분히 명확해서 손대지 않음
- 변경 9 (빈 → 방 카드 Reanimated 전환) — Phase 2에서 `LayoutAnimation` 으로 대체

---

## 4차 작업 (출시 차단 해소 + 흰 화면 디버깅 + 자동화 인프라)

날짜: 2026-04-13 세션. 한 세션에 출시 차단 항목 마무리, 어제부터 못 잡은 흰 화면 root cause 발견, 게임 버그 4개 fix, 자동화 도구 4종 구축까지.

### 4-1. 출시 차단 (S1~S4) — 거의 다 이미 끝나있었음

- `S1` `room_list` 확장 (hostName/hostId/scoreLimit/turnTimer/allowSpectators/createdAt) — 이미 서버에 구현됨
- `S2` `create_custom_room` 옵션 배선 — 서버 OK, **클라가 form → useSocket 까지 전달 안 함** → 한 줄짜리 fix `dd1bb9d`
- `S3` 방장 떠나기 → `transferHost` — 이미 구현됨
- `S4` 풀방 입장 거절 토스트 — 이미 구현됨, **9개 추가 에러 코드 한국어 매핑** `ff80741`
- `S+` 차단 사용자 방 필터링 — `dbGetBlockedFirebaseUids` 헬퍼 + `list_rooms` 가드 `19322a9`

### 4-2. 게임 버그 4개

| 커밋 | 버그 | 원인 |
|---|---|---|
| `3ab5f19` | 무제한 타이머 + 본인 입력 없이 게임 광속 자동 진행 | `setTimeout(31_536_000_000)` 32-bit signed int 한계 초과 → 즉시 1ms 후 발화. fix: 0 sentinel + `MAX_SAFE_TIMEOUT_MS` 가드 |
| `819c150` | 소원 카드 강제 시 어떤 카드도 못 냄 | `ActionBar.tsx` `playLock` 영구 잠김. 서버가 `must_fulfill_wish` 거부 → 턴 안 바뀜 → playLock release 안 됨. fix: `lockBriefly()` 1초 자동 해제 |
| `819c150` | 무제한 타이머가 클라에 30초로 표시 | `gameStore.onTurnChanged` 의 `turnDuration ? ...` truthy 체크가 0 무시. fix: `!== undefined` |
| `ff80741` | 9개 서버 에러 코드 한국어 토스트 누락 | `useSocket.ts` errorMap 확장 |

### 4-3. 흰 화면 — 어제부터 7번 넘게 시도해도 못 잡던 버그

**Root cause**: `packages/app/src/utils/sound.ts:239-242` 의 top-level `window.addEventListener` 가드 누락. 같은 클래스 버그가 이전 세션에 `bgm.ts`에서 fix 됐었지만 sound.ts 는 놓침. 

```js
// ❌ Before — RN에서 typeof window === 'object' 지만 window.addEventListener === undefined
if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', unlockAudio, { once: true });
}

// ✅ After — 함수 존재 자체를 검사
if (
  typeof window !== 'undefined' &&
  typeof window.addEventListener === 'function'
) {
  window.addEventListener(...);
}
```

위 한 줄짜리 `TypeError: undefined is not a function` 이 sound.ts 모듈 평가를 깨뜨리고, 그게 useSocket / GameResultScreen / AppRoot 의 정적 import 체인 전부를 무너뜨려서 React mount 가 한 프레임도 못 일어나고 → 순백색 Activity 배경만 남았음. Bridgeless 모드의 에러 swallowing 때문에 빨간 에러 화면도 안 떠서 디버깅이 거의 불가능.

**진단 방법** (이 세션의 핵심 발견): EAS 빌드는 quota + 시간이 많이 들어서 가설 검증 사이클이 느림. 그래서 ADB 자동화 워크플로우를 만들어서 한 사이클 30초~1분으로 줄임:
1. 기존 EAS-built APK 를 "shell" 로 두고
2. `expo export` 로 새 Hermes bytecode 만 생성
3. APK 안의 `assets/index.android.bundle` 만 swap
4. zipalign + apksigner debug 서명
5. adb install + 실행 + screencap + logcat

이걸로 5단계 phase probe 를 빠르게 돌려서 `app/index.tsx` → `app/_layout.tsx` → 라이브러리 로드 → AppRoot import → 마침내 sound.ts 에서 throw 함을 특정함.

**커밋**: `b0a5abf`

### 4-4. 자동화 인프라 (4종)

| # | 도구 | 위치 | 효과 |
|---|---|---|---|
| 1 | `npm run android:dev` | `packages/app/scripts/android-dev.mjs` | EAS 없는 dev 사이클: expo export → APK swap → install → 실행 → 스크린샷 → logcat. 한 사이클 30~60초. EAS quota 0 사용. 위 흰 화면 진단도 이걸로 했음. |
| 2 | `npm run android:visual` | `packages/app/scripts/visual-test.mjs` | pixelmatch + pngjs 시각 회귀. 시나리오 기반, top 100px 마스킹(상태바 배제), 0.1% tolerance. 현재 시나리오 3개: `01-splash`, `02-login`, `03-lobby` (게스트 로그인 풀 체인 자동). |
| 3 | pre-commit hook | `.githooks/pre-commit` + `packages/app/scripts/lint-rn-safety.mjs` | TypeScript AST 기반. top-level Web API 호출 (`window.addEventListener` 등) 을 가드 없이 쓰면 commit 차단. 오늘의 sound.ts 사고 재발 방지. 51 파일 0 violations. 활성화: `sh scripts/install-git-hooks.sh` |
| 4 | `custom-match-v3.test.ts` | `packages/server/src/` | 서버 통합 테스트 7개. v3 기능 (scoreLimit / turnTimer / allowSpectators / room_list 확장 / host transfer) + 4-2 의 setTimeout overflow fix 회귀 차단. 9.5초/run. |

**관련 커밋**:
- `62b096a` android-dev 스크립트
- `1d8d089` visual-test (pixelmatch)
- `e2749bd` 03-lobby interactive 시나리오 추가
- `1164aa7` pre-commit hook + lint-rn-safety
- `4f53859` custom-match-v3 통합 테스트

### 4-5. UI 정리

- `app/_layout.tsx` 의 `LAYOUT OK · android XX` 진단 배지를 `__DEV__` 가드 뒤로 숨김. Production APK 에서는 안 보임. 기저 진단 인프라 (early error capture, lazy AppRoot require try/catch) 는 안전망으로 유지.

### 검증

- `npx tsc --noEmit` (app + server): 0 errors
- `npx vitest run src/custom-match-v3.test.ts`: 7/7 passing
- `npm run android:visual`: 3/3 passing (back-to-back, diff < 0.05%)
- 폰 실기기 검증: Samsung R3CXC0JPRBF, Android 16 (API 36), New Architecture + Bridgeless + Hermes 에서 LoginScreen → Lobby 풀 렌더 확인

### 알려진 미해결 / 이월

- **EAS quota 무료 한도 소진** — May 01 까지 새 EAS 빌드 불가. 그 동안은 `npm run android:dev` 의 dev APK (debug-signed) 로 작업.
- **Visual test scenarios 04+** (커스텀 매치 → 방 생성 → 게임 → 결과) 는 ADB tap 이 Reanimated 카드를 안 받아서 stall. TODO 로 기록. 추후 좌표 / pointer-events 디버깅 필요.
- **`googleOAuth` 모바일 native flow** — 메모리 룰 미해결. 현재 popup (web) 만 작동. expo-auth-session 비활성 상태.

---

## 전체 커밋 히스토리 (브랜치)
```
(4차) e2749bd  visual-test: 03-lobby interactive scenario
(4차) 1d8d089  visual-test: pixelmatch + masking
(4차) 4f53859  custom-match-v3 integration tests (7 passing)
(4차) 1164aa7  pre-commit hook + lint-rn-safety (TS AST)
(4차) 62b096a  scripts/android-dev.mjs — one-command dev cycle
(4차) b0a5abf  fix: white screen — sound.ts window.addEventListener guard
(4차) 819c150  fix: wish-card play lockout + turn timer 0 sentinel
(4차) 3ab5f19  fix: turn timer "unlimited" → setTimeout overflow
(4차) ff80741  feat(errors): 9 server error codes → Korean toasts
(4차) 19322a9  feat: filter blocked hosts from room_list
(4차) dd1bb9d  feat: wire v2 room options from form to server
(v3) 93442e7  Phase 3 — filter bar cleanup
(v3) 812b381  Phase 2 — clean empty state
(v3) e588e05  Phase 1 — lobby bg + CardView for empty state
b8999d3  Phase 7 - keyboard shortcuts (web only)
566f1f5  Phase 1-4 - strip rank/mock/right-panel, card-click entry
d9969e0  fix: white screen — bgm + MMKV lazy
c2e9fa8  diag: minimal diagnostic build
d9902fb  fix(debug): firebase lazy + root-level error boundary
bbb3927  fix: Railway postinstall + ErrorBoundary
cf73a6f  fix(railway): inline postinstall
5a5b4d6  fix: white screen — add expo-application
f1549f7  docs: 1차 PROGRESS
55a0665  Phase 6 - remove old LobbyScreen modal
6033f7b  Phase 5 - mobile sheets + password modal
91e81bc  Phase 4 - right detail panel
f6798e8  Phase 3 - left room list
52cbe6f  Phase 2 - page skeleton + responsive
ba33880  Phase 1 - design tokens + deps
```

---

## 5차 작업 — 출시 전 마지막 안전망 (2026-04-13)

**목표**: "안 하면 망함" 영역의 마지막 안전망을 출시 전에 마무리.
**진행**: Phase 1~3 완료, Phase 4 사용자 입력 대기.

### Phase 1 — S3/S4 통합 테스트 ✅
**커밋**: `6d2c677`

PROGRESS.md 출시 차단 항목 S3/S4 를 실제 소켓 경로로 검증. 테스트 5개 추가 (+ 기존 7개 → 총 12개 pass).

- **S3-1 WAITING host drop → host_changed** ✅
  실제 `socket.disconnect()` 로 떨어뜨리고 남은 인간에게 방장 위임되는지 확인. 30초 기본 타이머를 200ms 로 줄이기 위해 `__setDisconnectTimeoutsForTest` 훅 신설.
- **S3-1b sole host drop → 방 파괴** ✅
  혼자 있던 방장이 끊기면 방이 실제로 삭제 (getRooms 비어있음).
- **S3-2 mid-game human drop → 봇 대체** ✅
  2인간+2봇 세팅에서 start_game 후 한 명 disconnect → 10초 타이머(300ms 로 축소) 후 seat 0 이 isBot=true. 방도 유지.
- **S4-1 5번째 join_room → room_full** ✅
  4자리 채운 뒤 다섯 번째 시도는 `error: room_full` 로 거부, 기존 4명 seat 보존.
- **S4-2 동시 5인 입장 race** ✅
  `Promise.all` 로 동시에 4명이 race → 정확히 3명 joined / 1명 room_full. 서버 state 에 4석 채워짐.

**부수 수정**:
- `socket-handlers.ts`: `WAITING_DISCONNECT_MS` / `TRICK_BOT_REPLACE_MS` 모듈-탑 const + `__setDisconnectTimeoutsForTest` 내보냄. 테스트는 try/finally 로 원복.
- `custom-match-v3.test.ts` `makeClient`: 100ms 고정 delay → `waitForEvent('login_success')` 로 변경. 기존 첫 테스트의 cold-start flakiness 수정.
- 서버 Firebase Admin cold-start 워밍업 추가 (beforeAll).

**vitest**: `12/12 passing`, duration 17.4s.

### Phase 2 — lint-rn-safety 확장 ✅
**커밋**: `6ba7a54`

기존 linter (`window.addEventListener` 등 특정 메서드 whitelist) 위에 **receiver-level 규칙** 추가. top-level 에서 `document` / `localStorage` / `sessionStorage` / `location` / `history` / `navigator` 어느 것이든 접근하면 차단 (call 과 property read 양쪽).

**가드로 인정**:
- `if (typeof <receiver> !== 'undefined') { ... }` (또는 `=== 'object'` / `=== 'function'`)
- `if (Platform.OS === 'web') { ... }`

**새 위험 패턴 발견 (실제 잠재 버그)**:
- `packages/app/src/utils/sound.ts:160-162` top-level `const isIOS = typeof navigator !== 'undefined' && (/iPad.../.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));`
  - `typeof navigator` 가드는 있지만 `&&` 단락 안의 property access 들은 guard 한정이 linter 관점에서 약함 + RN 에서 `navigator` 는 `{}` 로 polyfill 되어 있어 typeof 가드를 통과하지만 `.userAgent` 등은 존재하지 않음. 언젠가 터질 잠재 2차 흰 화면.
  - **수정**: `isIOS()` 를 lazy-memoized 함수로 전환. 첫 호출 시점에만 `navigator` 접근, 결과 캐시. `VOICE_STYLES` 는 `VOICE_STYLES_IOS` / `VOICE_STYLES_DEFAULT` 로 분리해 호출 시점에 선택.

**검증**:
- `lint-rn-safety: 51 file(s) scanned, 0 violations` (리팩터 후)
- 임시 bad.ts 에 5개 위험 패턴 (document.title / localStorage.getItem / history.pushState / location.href / navigator.userAgent) 넣고 돌리면 6개 violation 나옴 (localStorage 는 기존 + 신규 규칙 양쪽이 잡음)
- 가드된 good.ts (`typeof document !== 'undefined'` / `Platform.OS === 'web'` / function body) → 0 violations

### Phase 3 — android-dev smoke test ✅
**커밋**: `5accdd7`

`scripts/android-dev.mjs` 끝에 regression gate 추가. 설치+런치 후 자동 실행되며 다음 중 하나라도 걸리면 `process.exit(1)`:

1. **fatal 패턴 detection** — 기존 JS-error 검사는 `-s ReactNativeJS:V *:S` 로 필터해서 native crash 를 놓침. smoke 단계는 `AndroidRuntime:E ReactNative:E ReactNativeJS:E *:S` 로 넓게 잡음. 7개 패턴:
   - `FATAL EXCEPTION`
   - `AndroidRuntime.*Process.*has died`
   - `TypeError: undefined is not`
   - `ReferenceError`
   - `Unable to load script`
   - `JavaScript code execution failed`
   - `BUNDLE.*Loading failed`
2. **white-screen 픽셀 분석** — `pngjs` 로 방금 찍은 `dev.png` 를 읽어 `(R, G, B)` 모두 ≥ 240 인 픽셀 비율 계산. 90% 초과면 fail. 어제 `sound.ts` 사건 같은 silent failure 재발 차단.

실패 시 `smoke-fail-<ts>.log` 에 fatal line + full logcat 덤프.

**옵션**: `--no-smoke` 플래그 또는 `NO_SMOKE=1` 환경변수로 스킵 (빠른 dev 사이클 용).

**검증**:
- 정상 빌드: `Smoke test passed (white: 6.0%, fatal: 0)` ✅
- `NO_SMOKE=1`: `! Smoke test skipped (--no-smoke)` ✅
- fatal 패턴 regex 단위 검증: 6개 샘플 로그 라인 중 4개 flag, 2개 (정상 로그 + RN gesture warning) OK ✅

### Phase 4 — Sentry 크래시 추적 ⏸ 보류 (DSN 필요)

**사전 작업 필요 (사람)**:
1. https://sentry.io 계정 생성 (무료 플랜)
2. New Project → React Native, 이름 `tichu-app`
3. DSN 복사 (`https://xxx@xxx.ingest.sentry.io/xxx`)
4. `packages/app/.env` 에 `SENTRY_DSN=` 추가

위 작업이 끝나면 다음 세션에 재개. 구현 계획은 작업 지시서(Phase 4 section) 유지.

**이유**: 임의 더미 DSN 삽입 금지. `.env` 에 없으면 `initSentry()` 가 no-op 이라 실질적으로 0% 보호 — 그 상태로 commit 하면 "설치됐지만 안 돌아가는" 거짓 안전 상태가 된다.

### 최종 검증
- `npx tsc --noEmit` (app + server): 0 errors ✅
- `npx vitest run src/custom-match-v3.test.ts`: 12/12 passing ✅
- `node packages/app/scripts/lint-rn-safety.mjs`: 51 files, 0 violations ✅
- `npm run android:dev`: smoke test 통과 ✅
- Phase 4 Sentry: **보류** (DSN 대기)

### 출시 가능 여부 판정

**조건부 출시 가능.**
- Phase 1~3 은 출시 전 추가 안전망 역할을 수행하도록 자리 잡음. 회귀/흰 화면/방 정원/host 위임은 자동화로 방어됨.
- Phase 4 Sentry 가 빠져 있어서 **출시 후 첫 크래시는 사용자 제보로만 알 수 있음**. 베타/소프트런치라면 수용 가능, 정식 출시라면 DSN 먼저 넣고 Phase 4 마무리 권장.

