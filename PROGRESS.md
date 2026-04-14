# Custom Match — 풀스크린 리디자인 + 2차 정제

**브랜치**: `feat/custom-match-fullscreen`
**상태**: ✅ **1~5차 전 Phase 완료 — 출시 가능**

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
**진행**: ✅ 전 Phase 완료 (Phase 1~4).

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

### Phase 4 — Sentry 크래시 추적 ✅
**커밋**: `9dd698e`

사용자가 Sentry 계정 + `tichu-app` 프로젝트 생성 → `EXPO_PUBLIC_SENTRY_DSN` 을 `packages/app/.env` 에 추가 → 재개.

**설치**: `npx expo install @sentry/react-native` (v6.10.0). `app.json` 에 config plugin 자동 추가. `expo-doctor 17/17 checks passed`.

**래퍼**: `src/utils/sentry.ts`
- `initSentry()` — DSN 없으면 no-op, 있으면 `Sentry.init({ dsn, environment, enabled: !__DEV__, tracesSampleRate: 0.1, beforeSend, enableNative, enableNativeCrashHandling })`
- `setSentryUser(playerId, nickname)` / `clearSentryUser()` — 로그인/로그아웃 식별
- `reportError(error, context)` — 핸들된 에러 수동 리포트 (dev 는 콘솔만)
- `addBreadcrumb(message, category, data)` — 사용자 여정 타임라인
- `beforeSend` 훅: `request.cookies` 제거 + `request.headers` 중 auth/token/cookie 제거

**무료 플랜 보호**:
- `tracesSampleRate: 0.1` (10% 트랜잭션 샘플링)
- `enabled: !__DEV__` (개발 빌드는 이벤트 안 보냄)
- 이 두 가지로 free-tier 월 5,000 이벤트 한도 여유

**통합 지점**:
- `src/AppRoot.tsx` 최상단 — `installGlobalErrorHandler()` 직후에 `initSentry()` 호출. 다른 src import 보다 먼저 실행되도록 top-level 위치.
- `handleGuestLogin` → `setSentryUser` + `addBreadcrumb('guest login', 'auth')`
- `handleGoogleLogin` → `setSentryUser` + `addBreadcrumb('google login', 'auth')` + `reportError` (실패 시)
- `onDeleteAccount` → `clearSentryUser` + `addBreadcrumb('account deleted', 'auth')`
- 커스텀 방 생성/입장, 빠른 매칭 큐 → `addBreadcrumb('custom room create/join'/'quick match queued', 'room')`
- 매칭 취소 / `leaveRoom` → `addBreadcrumb('room leave', 'room')`
- 게임 시작 → `addBreadcrumb('game start', 'game')`
- `gameOver` effect → `addBreadcrumb('game over', 'game', { winner, scores })`
- `useSocket.ts` 의 `invalid_play` / `error` 핸들러 → `addBreadcrumb('invalid_play'/'server_error', '...-error', { reason/message })`

**검증**:
- `npx expo-doctor`: 17/17 passing
- `npx tsc --noEmit`: 0 errors
- `node scripts/lint-rn-safety.mjs`: 51 files, 0 violations
- `npm run android:dev`: install + launch + smoke test 통과
- 번들 사이즈: 4.32 MB → 5.37 MB (+1 MB, Sentry 네이티브 SDK)
- 실기기 logcat: `I ReactNativeJS: [Sentry] initialized` 확인

### 최종 검증
- `npx tsc --noEmit` (app + server): 0 errors ✅
- `npx expo-doctor`: 17/17 checks passing ✅
- `npx vitest run src/custom-match-v3.test.ts`: 12/12 passing ✅
- `node packages/app/scripts/lint-rn-safety.mjs`: 51 files, 0 violations ✅
- `npm run android:dev`: 설치 + 런치 + smoke test 통과 ✅
- 실기기 Sentry init 로그 확인 ✅

### 출시 가능 여부 판정

**출시 가능.** 5차 작업으로 다음 안전망이 모두 자리 잡음:
- **회귀 차단**: S3/S4 통합 테스트 12개가 host 위임/방 정원/race condition 을 소켓 레벨에서 지속 검증
- **흰 화면 예방**: lint-rn-safety 가 top-level Web API 접근을 commit 시점에 차단. sound.ts 2차 잠재 버그는 이번 패스에서 발견/수정됨.
- **빌드 regression gate**: android-dev smoke test 가 매 빌드 직후 logcat fatal + 흰 화면 픽셀 분석으로 자동 확인
- **출시 후 가시성**: Sentry 크래시 리포팅 + 식별 + 브레드크럼 → 첫 크래시/에러를 사용자 제보 없이 자동 감지

---

## 6차 작업 (2026-04-14) — 로비 landscape 버그픽스 + 문서·자동화 정비

출시 준비 완료 이후의 잔여 정리 작업. 한 세션에 묶어서 처리.

### 버그픽스 — LobbyScreen landscape

| 커밋 | 내용 |
|---|---|
| `60019c3` | 빠른 매칭 버튼의 `!connected` disabled 가드 제거 + compact 카드 높이 175→140 + `centerCompact` 를 flex-start 로 변경해 게임 규칙 버튼이 하단 nav 와 겹치지 않도록 수정 |

**증상:** 가로 모드에서 (1) 홈/랭킹/설정 nav 가 게임 규칙 버튼을 가림, (2) 빠른 매칭 버튼이 socket 연결 전까지 비활성. **원인:** `centerCompact` 가 `justifyContent:'center'` 라 content 가 아래로 밀려 nav 와 겹쳤음. 빠른 매칭은 `disabled={!connected}` 로 막혀 있었음. **검증:** `android:dev` 로 실물 폰 스크린샷 확인.

### 문서 정비

| 커밋 | 내용 |
|---|---|
| `bad0f2e` | CLAUDE.md 에 adb 기반 모바일 자동화 워크플로우 공식 문서화 (android:dev / android:visual / 알려진 제약) |
| `7cc6a28` | CLAUDE.md 에 `## 자동화` 섹션 추가 — git hooks / android:dev / android:visual / CI / workspace 스크립트 6개 정리 |
| `4a23662` | CLAUDE.md 전면 재작성 (5차 완료 상태 기준) + 원본을 `claude.md.bak` 으로 보존. §9 클라이언트 구조, §10 피처 시스템, §13 최근 사고 이력, §14 운영 규칙 섹션 신규 |

### 자동화 개선

| 커밋 | 내용 |
|---|---|
| `2258e4c` | visual-test.mjs 4건 패치 + baseline 전체 갱신 |

**개선 사항:**
- `resetData: true` 시나리오 옵션 + `pm clear com.tichu.app` 호출로 saved nickname 때문에 03-lobby / 04-custom-match baseline 이 오염되던 문제 해소
- `shell screencap -p /sdcard/...` 가 Samsung One UI 에서 `-p` 를 stdout-pipe 로 오해하던 버그 → `exec-out screencap -p` + `spawnSync` 로 우회
- Samsung lockscreen 해제 위해 `KEYCODE_WAKEUP` 뒤에 위로 스와이프 추가
- `com.openai.chatgpt` force-stop 으로 주입된 탭이 다른 포커스 앱에 전달되는 사고 방지
- 4개 baseline 전부 새로 캡처 (01-splash / 02-login / 03-lobby / 04-custom-match). 재실행 4/4 pass, diff < 0.01%.
- 04-custom-match baseline 최초 커밋 (기존에는 시나리오만 있고 파일 없었음)

### 남은 숙제

- 나머지 화면 (GameScreen · RankingScreen · ShopScreen 등) 의 landscape 검증은 아직 — 필요 시 visual-test 에 시나리오 추가

---

## 7차 작업 (2026-04-14) — 결정성 테스트 인프라 + 로비 하위 화면 visual-test

출시 후 회귀 방지 인프라 보강. 4개 단계로 나눠 진행, 단계마다 commit 끊음.

### visual-test scenarios 05~10 추가

| 커밋 | 내용 |
|---|---|
| `122fcc7` | scenario runner 에 `swipe` step 지원 + 로비 하위 화면 6개 시나리오 + baseline 캡처 |

- **05-rules** / **06-ranking** / **07-settings** / **08-shop** / **09-profile** / **10-achievements** 추가
- 좌표는 03-lobby baseline PNG 를 픽셀 분석해 추출 (orange nav dot 으로 탭 좌표, mint `더보기 ›` 색 매칭으로 profile → achievements 버튼 좌표)
- 10-achievements 는 ProfilePage 를 두 번 스와이프해야 "더보기" 노출되는 구조 → `swipe` step 신규 추가
- Samsung Notes force-stop 추가 (포커스 스틸 방지)
- `pm clear` 로 안 지워지던 stuck state 는 `adb uninstall` + `android:dev` 재설치로 근본 해결 (Firebase Keystore 의심 → 재설치 후 정상)
- **검증:** 전체 1~10 scenario `android:visual` 돌려 **10/10 pass, 모든 diff 0.000%**

### 0단계 — Shuffle / Bot RNG 결정성 주입

| 커밋 | 내용 |
|---|---|
| `93a8249` | xorshift32 PRNG + `__setShuffleRngForTest` / `__setBotRngForTest` |

**배경:** 기존 `simulation.test.ts` / `bot-benchmark.test.ts` 가 `Math.random()` 에 의존해서 **결정적 회귀 게이트로 쓸 수 없었다**. 시드 고정해야 "봇 코드 변경 → 시드 X 결과 Y 가 깨졌다" 를 감지 가능.

- `packages/shared/src/rng.ts` — 30줄 xorshift32 PRNG. 외부 의존성 없이 RN + Node 양쪽에서 쓰려고 seedrandom 대신 직접 구현. FNV-1a 해시로 문자열 시드 지원.
- `shuffleDeck` 이 모듈 레벨 `shuffleRng` 참조 → `__setShuffleRngForTest(rng | null)` 로 테스트 주입. 프로덕션은 `Math.random` 그대로.
- `bot.ts` 의 `Math.random` 4곳 (easy 봇 70/30 분기, random single, 60% pass, 20% bomb) 을 `botRng()` 로 교체. `__setBotRngForTest` 동일 패턴.
- **단위 테스트:** `rng.test.ts` 9개 (시퀀스 결정성 / 시드 다양성 / 범위 / deck multiset 보존) + `determinism.test.ts` 5개 (100회 동일 셔플, startRound 동일 딜링, 100회 동일 봇 결정).

**검증:** shared 163/163 + game-engine/game-flow/e2e/bomb-window/determinism 117/117 통과. 기존 테스트 회귀 없음.

### 1단계-a — CI 에 RN safety lint job 추가

| 커밋 | 내용 |
|---|---|
| `7091782` | `.github/workflows/ci.yml` 에 `lint-rn-safety` job 신규 |

pre-commit hook 만으로는 `git commit --no-verify` 로 우회 가능 → CI 강제 게이트 필요. 2026-04-13 `sound.ts` 흰 화면 사고 (§13 #1) 회귀 차단.

- 기존 4 job 패턴 따름. `test-shared` 를 `needs` 로 지정해 `npm ci` 캐시 재사용.
- `node packages/app/scripts/lint-rn-safety.mjs` 를 레포 루트에서 실행. linter 가 workspace 의 typescript 로 AST walk.
- **검증:** 레포 루트에서 `52 file(s) scanned, 0 violations` 확인.

### 1단계-b — 클라 회귀 박제 (playLock + turnDuration)

| 커밋 | 내용 |
|---|---|
| `c670a69` | packages/app 에 vitest 인프라 최소 셋업 + §13 #3 / #4 두 건 단위 테스트 박제 |

**App vitest 인프라 (최소 스코프):**
- `packages/app/vitest.config.ts` — node environment, `src/**/*.test.ts(x)` include, `react-native` 알리아스 → `test/mocks/react-native.ts` 의 5줄 shim (Platform 만 export)
- `packages/app/tsconfig.json` — `vitest.config.ts` 제외 (Expo module preset 이 `import.meta.url` 거부 → exclude 로 해결)
- `packages/app/package.json` — `"test": "vitest run"` + vitest devDep
- `.github/workflows/ci.yml` — 신규 `test-app` job (기존 typecheck-app 패턴 미러링)
- **스코프 규칙:** 순수 로직 (state reducer, util) 만. 컴포넌트 렌더링이나 실제 RN 네이티브 모듈이 필요한 테스트는 여기 아님. 확장 필요하면 별도 integration suite.

**회귀 박제 (두 건):**

1. **§13 #4 — turnDuration===0 truthy 체크** (`gameStore.test.ts`, 5 테스트)
   - `turnDuration=0` 그대로 적용되는지 (0 = 무제한 sentinel)
   - `turnDuration=30000` 정상 적용
   - 이벤트에 `turnDuration` 생략 시 기존 값 유지
   - seat + isMyTurn 동시 flip
   - `dragonGiveRequired` 가 turn change 에 clobber 되지 않는지

2. **§13 #3 — playLock 영구 잠김** (`play-lock.ts` + `play-lock.test.ts`, 5 테스트)
   - 3줄짜리 `setTimeout` 기반 릴리즈를 `scheduleLockRelease()` 유틸로 추출, `PLAY_LOCK_DURATION_MS=1000` 상수화
   - `ActionBar.tsx` 가 이제 이 유틸 호출 — 회귀 가 2-step (import 제거 + body 수정) 이 돼야 박제 뚫림
   - fake timers 로 검증: 동기 해제 없음 / 정확히 1000ms 에 발화 (999 에서 아직 안 함, 1000 에서 정확히 1회) / 커스텀 duration pass-through / `clearTimeout` handle 로 취소 가능 / 기본값 1000ms 고정 (임의로 못 줄이게)

**검증:** `npx vitest run` 2 files / 10 tests pass in ~600ms, `npm run typecheck` 0 errors, lint-rn-safety 52 files / 0 violations, pre-commit hook 통과.

### 3/4단계 — Self-play 회귀 게이트 승격 + AI 벤치 CI 분리

| 커밋 | 내용 |
|---|---|
| `9c040c3` | simulation.test.ts 를 결정적 regression gate 로 승격 + bot-benchmark 를 CI 밖으로 |

**simulation.test.ts (회귀 게이트):**
- `simulateOneGame(gameIndex, seed)` 가 호출 즉시 두 RNG 시드 주입 (`createSeededRng(seed)` + `createSeededRng(seed ^ 0x9e3779b9)` — golden-ratio 오프셋으로 두 스트림 독립)
- 게임 수 **100 → 50** (CI 60s 예산 대응, 결정적이라 50 시드도 회귀 감지력 동등)
- 라운드별 `preRoundScores` 캡처 → `roundScoreSums[]` 에 per-round delta 축적
- `afterEach` 로 두 RNG 리셋 (파일 간 leak 차단)

**강화된 회귀 게이트 단언:**
1. `errors.length === 0` (이전 `≥90%` 허용 → zero-tolerance)
2. `(delta % 100 + 100) % 100 === 0` — 라운드 점수 delta 100 의 배수 (JS `-0 !== 0` 쿼크 정규화)
3. `Math.abs(delta) ≤ 1000` — base 200 + 4 × tichu 200 상한
4. `winner.score ≥ 1000` — 게임이 정말 끝까지 진행됐는지

**결정성 증명 테스트 신규:** 시드 5개 (1, 7, 42, 999, 31337) × 연속 두 번 실행 → 10개 통계 필드 byte-identical.

**bot-benchmark 분리:**
- `src/bot-benchmark.test.ts` → `src/bot-benchmark.bench.ts` (vitest default glob `*.test.ts` 에서 자동 제외)
- `simulateGame(t1, t2, seed)` 시드 스레딩, `seed = (t1.charCodeAt(0)*31 + t2.charCodeAt(0))*1000 + (i+1)` 로 matchup 별 시드 공간 분리
- 신규 `vitest.bench.config.ts` (bench 전용, 10분 timeout) + `scripts/bot-benchmark.mjs` wrapper + `npm run benchmark -w packages/server`

**검증:**
- `vitest list` (default): bot-benchmark 항목 0개 ✓
- `vitest list --config vitest.bench.config.ts`: 5 matchup ✓
- CI-equivalent run (socket-sim 제외): **7 files / 131 tests pass in ~54s** ✓
- `simulation.test.ts` 단독: 50게임 게이트 (~46s) + 결정성 증명 (~9s) 총 55.8s ✓

### 2단계 실측 — 잘못된 블로커 가설 정정 (세션 1)

| 커밋 | 내용 |
|---|---|
| `9d9e3be` | CLAUDE.md §4.4 재작성 — "Reanimated 뷰 = UIAutomator 비노출" 진단 정정 |

**이전 세션에서 박제된 블로커 가설 2개가 실측으로 검증 불가 판정.**

실측: lobby → 커스텀 매치 → 방 만들기 모달 → MatchmakingScreen 까지 네비게이션 후 hostActions 버튼에 ADB tap 시도.

결과:
- `uiautomator dump` 가 MatchmakingScreen 에서 단 한 번도 성공하지 못함 (10회 retry). 원인은 Reanimated 뷰 자체가 아니라 `elapsed` 카운트다운이 secondly re-render 로 JS 스레드를 idle 못 시키는 것. 정적 화면 (로비/랭킹/설정/상점/프로필/업적) 에선 dump 정상 — baseline 10개가 증거.
- ADB input tap 이 `InputDispatcher` 로 window 에 정상 전달됨 (logcat 확인, DOWN+UP) 인데도 `S.hostActions` flex-row 안의 셔플/봇 채우기/시작 버튼은 반응 안 함. 같은 화면의 `나가기` (flex row 밖) 은 정상 작동. 6개 좌표 × 3개 tap 방식 (`tap` / `touchscreen tap` / `swipe-tap`) 전부 실패.

결론: 블로커 두 가지 원인 — 타이머 re-render 로 인한 dump idle state 실패 + flex-row nested touchable hit-test race. 해결책으로 **test-mode deeplink** 가 제안됐지만, 다음 세션에서 실측하면서 진단이 한 번 더 뒤집힘 (아래 참조).

### MatchmakingScreen landscape 슬롯 stretch 버그픽스 (세션 2 — 진짜 원인)

| 커밋 | 내용 |
|---|---|
| `4e3a10d` | MatchmakingScreen landscape 슬롯 stretch + socket polling fallback |

**유저 보고:** "커스텀 모드 봇 채우기 버튼이 안눌려서 진행이 안되고 가로 화면에서 전부 잘리게 나와."

이 보고가 결정적. **물리 터치에서도 안 눌린다** = ADB 한정 버그가 아닌 **진짜 프로덕션 버그**. 위 "2단계 실측" 에서 박제된 가설 (Reanimated 차단 / flex-row hit-test race) 이 **틀렸음** 을 확인.

**실측 픽셀 분석으로 진짜 원인 규명:**
- Tester slot 의 orange border bbox 가 y=**193-844** (651px tall) — minHeight 120 인데 왜 이렇게 큰가?
- 원인: `slot: minHeight: 120` 만 있고 height/maxHeight 미지정. `slotsGrid: alignItems: 'center'` 의 기본 cross-axis stretch 때문에 teamCol → slot 이 slotsArea flex:1 높이 (~680px) 에 맞춰 늘어남. 실제로 슬롯이 버튼 row 영역 (y=810-845) 을 시각적으로 덮음.
- 버튼들은 visible 하지만 슬롯 View 가 pointer-event 를 먼저 잡아먹음. 그래서 **물리 터치 + ADB tap 둘 다 불가**.

**"2단계 실측" 에서 왜 못 잡았는가:**
이전 세션에서는 "타이머 때문에 dump 실패" 가설만 보고 시선을 다른 곳에 박아둠. 실제로는 `uiautomator dump` 가 아예 실패해서 슬롯의 bounds 를 볼 방법이 없었고, 픽셀 분석에서도 buttons 의 위치만 찾고 슬롯 bbox 는 안 쟀음. 유저의 **"가로 화면에서 전부 잘림"** 보고 덕에 방향이 슬롯 bbox 분석으로 전환됐고 즉시 원인 파악.

**수정 (MatchmakingScreen.tsx):**
- `slot: height: 140` 고정 (minHeight 대체)
- `slotsGrid: alignItems: 'flex-start'` — cross-axis stretch 차단
- `vsCol: alignSelf: 'center'` — flex-start 전환으로 VS 가 위로 붙는 걸 방어
- `slotsArea: overflow: 'hidden'` — 추후 overflow 발생해도 bottom 영역 보호
- `bottom: flexShrink: 0` — slotsArea 가 bottom 눌러내지 못하게
- `hostActions: flexWrap` 제거 — landscape 에선 한 줄에 다 들어가는데 wrap 이 레이아웃 계산을 비결정적으로 만듦

**검증 (mm-after-fix.png 픽셀 분석):**
- 이전: Tester orange bbox y=193-844 (651px, 버튼 row 침범)
- 이후: Tester orange bbox y=303-552, 버튼 row y=821-843 — 명확히 분리

### Socket cleartext traffic 차단 발견 (dev-only)

같은 커밋 (`4e3a10d`) 에 부수 작업. 레이아웃 픽스 후에도 ADB tap 으로 봇 채우기 테스트가 실패하길래 onPress 에 console.log 를 심어봤더니 **onPress 는 발화** 하는데 `players` 가 전부 null — 즉 서버가 `room_joined` 를 돌려보내지 않은 상태.

- `adb shell curl http://localhost:3001/health` → `{"status":"ok","rooms":0}` 정상 (rooms=0 = 아무 방도 안 만들어짐)
- App 의 socket.io → `connect_error: websocket error` 무한 retry. polling 도 `xhr poll error`.
- 원인: base APK 의 AndroidManifest 에 `usesCleartextTraffic` 설정 없음. targetSdk 34 기본값은 cleartext 차단. HTTP `localhost:3001` 요청이 NetworkSecurityConfig 에 의해 rejected. `curl` 은 shell 유저로 돌아서 정책 우회 → health check 만 성공하는 혼란 상황.

**부분 완화:** socket.io `transports: ['polling', 'websocket']` 로 순서 변경. polling 이 먼저 시도되므로 일부 환경에서 fallback 경로가 조금 더 견고. **완전 해결 아님** — 로컬 dev 에서 서버 통신 필요 시 `app.json` 의 android 에 `usesCleartextTraffic: true` 추가 후 base APK rebuild (EAS build) 해야 함. 다음 세션 숙제.

**중요:** cleartext 차단은 **로컬 dev 전용** 문제. 프로덕션 APK 는 HTTPS 서버 URL 을 쓰므로 영향 없음. 유저의 "버튼 안 눌림" 프로덕션 재현 가능 원인은 **layout bug 뿐**.

### (2026-04-14 세션에 정정/해결됨) 남은 숙제 — ~~7차 이전~~

- ~~base APK rebuild (usesCleartextTraffic + dev deeplink)~~ — 8차 세션에서 portrait lock 과 같이 처리 시작. 로컬 release 빌드는 monorepo entry resolution 때문에 여전히 막혀 있고 EAS 는 월 quota 소진. 5월 1일 quota 리셋까지 보류.
- **GameScreen landscape 검증** — 8차 세션에서 **landscape 자체 폐기** (`app.json` portrait lock). landscape 검증 불필요. 대신 portrait 에서 GameScreen 동작 미검증 — 다음 실물 빌드 때 확인 대상.
- ~~visual-test scenario 11~15~~ — landscape 폐기로 재평가 필요. 현 baseline 은 전부 landscape 2340×1080 기준이라 portrait 전환 이후 무효화됨.
- 5단계 (단일 실앱 + 3 결정적 봇 모드) — 별개 트랙, 변동 없음.

---

## 8차 작업 (2026-04-14) — Portrait lock + LobbyScreen desktop 전면 재작업

**브랜치**: `master` (feat/custom-match-fullscreen 는 이미 master 로 ff 머지 완료)

### 커밋 히스토리 (이 세션)

```
caa109a chore: gitignore expo prebuild + monorepo bundle stub
fa58902 fix(mobile): stack hostActions as column for portrait
24c4ded feat(lobby/web): PC landing page layout + redundancy cleanup
0c2e10e feat(login/web): PC desktop scale-up for logo/card/inputs
2ed593c fix(web): hide LAYOUT OK dev banner on web platform
16a19b1 feat(responsive): add Platform-aware isDesktop signal
2a0557f fix(mobile): lock orientation to portrait                       ← 세션 초반
```

### 의사결정 요약

1. **Landscape 실험 폐기** — 7차까지 "landscape 지원" 방향으로 갔던 작업이 계속 회귀 사이클에 들어가서 `app.json` orientation 을 `default` → `portrait` 으로 되돌림. 모바일은 portrait 만 지원. landscape 관련 모든 후속 시도 (visual-test baseline / ADB tap hit-test / Reanimated idle state 실측 등) 가 전부 부채로 남음.

2. **LobbyScreen desktop 완전 재작업** — "모바일 UI 를 PC 에 올린" 접근이 12-17차 동안 계속 실패 (카드 폭 매번 어긋남, 사용자 의도 오해석 반복). 18차에서 "PC 게임 랜딩 페이지 스탠다드" 구조로 처음부터 다시 설계. 결과는 AppBar (로고 + nav 메뉴 + 프로필) + Hero + Cards (2개 400×380 landscape stack) + Footer. 1-17차 desktop 실험 코드 전부 제거.

3. **LoginScreen desktop scale-up** — 비슷한 방향으로 로고/카드/input/버튼 전부 scale up. `isDesktop` 분기 안에서만 작동, 모바일 그대로.

4. **responsive.ts isDesktop 재정의** — 이전 `width > 1024` 단독 → `Platform.OS === 'web' && width >= 1024`. 회전한 모바일에서 오작동 방지.

### 최종 desktop 구조 (LobbyScreen)

```
SafeAreaView
├─ BackgroundWatermark               (splash.png, resizeMode contain)
├─ particleLayer                     (카드 심볼 floating)
├─ dHeader (72px, bg 0.4)
│   ├─ [TICHU 로고]
│   ├─ [홈 | 랭킹 | 상점 | 친구 | 설정]  nav menu (active underline)
│   └─ [프로필 아바타 + 닉네임]           right tools
├─ ScrollView dMainContent
│   ├─ dHero       (태그라인 + 로고 84 + divider)
│   ├─ dCards      (row, gap 48, 카드 2개 400×380 landscape)
│   └─ dRulesBtn   (848 wide = 카드 2개 + gap, 풀 배너)
├─ dFooter (52px, bg 없음 — transparent)
│   └─ "© 2026 Tichu" | "v1.0.0 · 이용약관"
└─ {overlays}                        friends 패널 / 출석 / 닉네임 편집 (공통 변수)
```

모바일 세로 구조: **미변경**. `isDesktop` early-return 으로 분기, 모바일 JSX 에 있던 `isDesktop && S.xxxDesktop` 조건부 전부 제거 (dead code 였음).

### 추가 정리

- **모바일 코인 뱃지 제거** — 상단 우측 `🪙 N` 제거. 코인은 상점 화면에서만 보임 (desktop + mobile 공통).
- **Desktop 상점/친구 중복 제거** — AppBar 에 상점/친구가 nav menu 에 있고, 상단 우측에도 있었음. 중복 → 상단 우측 제거. 프로필만 남김.
- **`MatchmakingScreen.hostActions`** row → column — 호스트 컨트롤 (셔플/봇채우기/시작) 이 모바일 portrait 폭에 안 들어가서 잘렸음. `flexDirection: 'column'` 으로 3줄 stack.
- **Orientation portrait 로 락** — `app.json` + `AppRoot.tsx` 주석 갱신. CLAUDE.md §4.4 의 ADB tap hit-test 이슈 (flex-wrap row) 는 부수적으로 해결됐을 가능성 있음 (flex-wrap 자체가 사라졌으므로).
- **Overlays JSX 추출** — friends 패널 / 출석 / 닉네임 편집 3개를 `const overlays = <>...</>` 로 공통 변수화. desktop/mobile 양쪽에서 재사용, 137 라인 중복 제거.
- **LAYOUT OK 디버그 배너** — web 에서 숨김 (`Platform.OS !== 'web'` 가드 추가). native safety net 은 유지.
- **monorepo bundle stub** (`/index.js`) — expo prebuild 시 `EXPO_USE_METRO_WORKSPACE_ROOT=1` 환경에서 Metro 가 workspace root 의 `./index.js` 를 찾는 버그 우회용. 실제 엔트리 `packages/app/index.js` 를 require 하는 forward stub. `packages/app/android/` gradlew assembleRelease 에서만 쓰임. gitignore 에 `android/`, `ios/` 추가.

### 프로덕션 상태 검증 (세션 끝 시점)

```
Vercel (웹):    https://tichu-app.vercel.app/          → HTTP 200
                  번들에 Railway URL 정상 inlined
Railway (서버): https://accomplished-purpose-production-9135.up.railway.app/health
                  → HTTP 200 | serverVersion 1.1.0 | rooms 0 | uptime 500s
```

로컬 `.env` 의 `EXPO_PUBLIC_SERVER_URL=http://localhost:3001` 은 로컬 dev 전용, gitignored, 배포 영향 없음. Vercel dashboard 측 env var 가 Railway URL 로 정상 주입됨.

### 품질 게이트

- App `tsc --noEmit`: **0 errors**
- Shared 테스트: **163/163 pass**
- RN safety lint: **55 files / 0 violations**
- Pre-commit hook: 6 커밋 모두 통과

### 남은 숙제

- **Portrait base.apk 실물 검증 미완** — `.android-dev/base.apk` 가 debug 변형이라 swap 워크플로우에서 Metro 먼저 찾으려 할 위험. 실제 디바이스에서 portrait 고정 + 게임 흐름이 작동하는지 미검증. EAS preview 빌드 후 swap 필요 (월 quota 소진, 5/1 리셋).
- ~~**LobbyScreen 죽은 스타일 4개 제거**~~ — 완료 (`dIconBtn`, `dIconText`, `dBadge`, `dBadgeText` 제거).
- ~~**Desktop 친구 알림 배지 복원**~~ — 검토 후 **의도적으로 복원 안 함**. 게임 로비 주 목적은 플레이이고, 친구 요청은 nav menu 경유로 확인 가능. UI 단순화가 더 낫다고 판단.
- **`custom-match-v3.test.ts` flaky 조사** — "create_custom_room options applies scoreLimit/turnTimer/allowSpectators" 테스트가 5s timeout. 다른 11 tests 는 pass. CI 에서 실패하면 블로커. socket-sim 계열 (`socket-sim.test.ts`, `socket-sim-100.test.ts`) 는 이미 CI 에서 제외됨.
- **visual-test baseline 전면 재캡처** — 현재 baseline 10개 (`01-splash` ~ `10-achievements`) 는 landscape 2340×1080 기준. portrait 전환 이후 전부 무효. Android 재빌드 이후 portrait 해상도로 재생성 필요.
- **GameScreen portrait 검증** — 기존 설계가 landscape 기준이었을 가능성. portrait 에서 PlayerHand / OpponentHand / TableArea 레이아웃이 정상 동작하는지 미확인. portrait base.apk 나오면 1순위 검증.
- **프로덕션 스모크 테스트** — 2026-04-14 Vercel `tichu-app.vercel.app` 에서 로그인 + 로비 확인, 사용자가 "잘 된다" 컨펌. 전체 게임 플로우 (매칭 → 플레이 → 결과) 는 별도 확인 필요.

### 8차-b (2026-04-14 추가 작업)

- `c9a32e4` **fix(server/test): resolve custom-match-v3 flaky first-test timeout** — warmup 을 `login_success` 대기로 변경, `vitest.config.ts testTimeout: 15000`. 12/12 pass, 첫 테스트 1326ms.
- `3bd90d9` **refactor(lobby/web): remove dead desktop icon button styles** — `dIconBtn`/`dIconText`/`dBadge`/`dBadgeText` 제거 (AppBar 재작업 후 JSX 참조 없음). 친구 알림 배지는 의도적으로 복원 안 함.
- **스몰 티츄 확인 모달** (GameScreen) — 스몰 티츄 버튼 클릭 시 "정말 선언? (+100/-100)" 확인 오버레이. 실수로 누르는 사고 방지. CLAUDE.md §14.2 준수하여 native Modal 대신 absolute overlay View 사용.
- **Hard 봇 Phoenix 싱글 낭비 버그 픽스** (`bot.ts pickFollowPlay` + `pickLeadPlay`) — 낮은 싱글 (6-10) 트릭에 봉황을 내버리는 버그 수정. 근본 원인: ① overkill 보상 (margin ≤1 = +20) 이 봉황 싱글 (항상 margin 0.5) 에 자동 적용, ② Phoenix 보존/조합 우선 로직 부재. 수정: ① 봉황 싱글은 overkill 보상 제외, ② 새 `countRemainingByRank()` 헬퍼로 A/K 잔량 카운팅, ③ `[NEW #7]` Phoenix 보존 섹션 — 조합 가능 시 -60, A 남아 있고 바닥 <13 → -70, A 다 나왔고 K 남아 있고 바닥 <12 → -40, 바닥 A → +45, 바닥 K + A 다 나감 → +28, 손 ≤2 → +30, ④ lead 쪽에도 동일한 phoenix-combo 우선 -40 추가. 50-game 자가 플레이 게이트 + 결정성 테스트 통과.
- **Hard 봇 카드 교환 지능화** (`bot.ts decideBotExchange`) — 사람다운 교환 전략으로 업그레이드. ① 새 `isStrongTichuHand()` helper 로 "내가 티츄할 가능성" 예측 (tichuDeclarations 만 보던 기존 로직을 확장) — 분석 점수 ≥4.5 면 예측 모드. ② 새 `pickEnemyGiftsHard()` — 상대팀 양쪽 카드를 한꺼번에 선택, 낮은 페어 (value ≤10, 둘 다 큰 조합 미사용) 가 있으면 **찢어서 한 장씩** 분배. 2,2,3,... 같은 손패에서 2 두 개를 양쪽에 줘서 폭탄 리스크 0 + 저평가 카드 처분. 페어 없으면 개 + 낮은 싱글, 그 다음 낮은 free 싱글 2장. ③ 큰 조합 (triple/fullhouse/straight/steps/bomb) 에 들어간 카드는 **누구에게도 주지 않음** — 기존은 페어도 보호 대상이었으나 이제 페어는 splittable. ④ 적 금지 카드를 A → **A + K** 로 강화 (Q 도 회피 대상). ⑤ 새 `pickWeakFreeCard()` helper — 내 티츄 모드 시 팀원에게 약카드 주되 큰 조합은 보호. 팀원 선물 일반 모드에서도 free 카드 중 A → 봉황 → K → Q → J 우선순위. 131/131 테스트 통과, 티츄 성공률 60% → 62% 소폭 상승.
- **봉황 싱글 가시화** (`TableArea.valueLabel`) — 테이블에 봉황 싱글이 놓였을 때 "봉황" 만 표시하던 레이블을 "봉황 (J 위 · 11.5)" 처럼 직전 카드 랭크 + 실제 값 (`prev + 0.5`) 둘 다 표시로 변경. 리드 시엔 "봉황 (리드 · 1.5)". 플레이어가 봉황의 효과적 강도를 즉시 파악 가능. "싱글" 접미사는 이미 라벨에 봉황이 명시되므로 중복 제거. TTS 는 "봉황" 유지 (숫자 읽기 부자연스러움).
- **폭탄 인터럽트 턴 이벤트 누락 버그 픽스** (`socket-handlers.ts submit_bomb`) — 사용자 버그 리포트: "상대팀이 용 냄 → 내 team 패스 → 파트너 차례에 내가 급하게 폭탄 → 파트너가 패스 못함, 서버가 not_your_turn 거부". 원인: `submit_bomb` 의 "내 턴 아닐 때 인터럽트" 경로 (line 1316-1329) 가 `room.currentTurn = nextSeat` 로 서버 상태만 업데이트하고 `your_turn` / `turn_changed` 이벤트를 emit 안 함. 클라이언트의 `currentTurn` 은 인터럽트 직전 턴 주인 (파트너) 에 stuck → 파트너 pass 클릭 → server 는 실제 currentTurn 이 다음 enemy 라서 거부. 봇이 있으면 수초 후 봇 행동으로 자동 풀림 (그래서 사람 파트너에서만 재현). 수정: `broadcastEvents(io, room, [{ type: 'your_turn', seat: nextSeat }])` 추가하여 turn 변경을 전체에 알림. 131/131 테스트 통과.

