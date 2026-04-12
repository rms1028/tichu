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

## 전체 커밋 히스토리 (브랜치)
```
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
