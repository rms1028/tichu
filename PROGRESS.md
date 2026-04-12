# Custom Match 풀스크린 리디자인 — 진행 상황

**브랜치**: `feat/custom-match-fullscreen`
**상태**: ✅ **전 Phase 완료**
**디자인 기준**: 채팅으로 제공된 mockup HTML (inline — 파일로 저장 안 됨)
**라우팅 패턴**: `LobbyScreen` 의 `page` state 에 `'customMatch'` 추가

---

## Phase 1: 디자인 토큰 + 패키지 ✅
**커밋**: `ba33880`
- `theme.ts` 에 `cm*` prefix 토큰 30+ 추가 (cmBg0..3, cmGold/Soft/Deep, cmInk/Dim/Mute, cmLine/Strong, badge variants, ping good, topbar fallback)
- `CM_BREAKPOINTS` (desktop 1100, tablet 768) + `cmLayout(width)` 헬퍼
- `expo-linear-gradient ~14.0.2` 설치
- `expo-blur ~14.0.3` 설치 (iOS only, Android 는 cmTopbarSolid 단색 fallback)
- 기존 `COLORS` 변경 없음
- ✅ tsc 0, expo-doctor 17/17

## Phase 2: 페이지 골격 + 라우팅 + 반응형 기반 ✅
**커밋**: `52cbe6f`
- 신규 `src/utils/roomDataAdapter.ts` — 결정적 hash 기반 mock 어댑터, `generateMockRooms()` 6개, `pingQuality()`, `countWaitingPlayers()`
- 신규 `src/screens/CustomMatchScreen.tsx`
  - SafeAreaView + LinearGradient 배경 + 龍/鳳 한자 (opacity 0.025)
  - 상단바: iOS BlurView, Android cmTopbarSolid
  - 반응형 split (desktop/tablet/mobile)
  - 첫 방 자동 선택 + 10초 polling cleanup
- `LobbyScreen.tsx` Page 타입 확장 + 라우팅 + 트리거 버튼 onPress 변경
- 기존 모달 코드는 보존
- ✅ tsc 0

## Phase 3: 좌측 방 목록 ✅
**커밋**: `f6798e8`
- 섹션 헤더 (LinearGradient 액센트 바 + serif 타이틀 + ko 부제 + 실시간 카운터)
- 필터 바 (검색 input + 칩 가로 스크롤 + 새로고침 버튼)
- Chip 컴포넌트 (active/pressed/dot variants)
- RoomCard
  - 데스크톱/태블릿: 가로 그리드 (avatar | info | slots | ping | enter)
  - 모바일: 세로 배치 (avatar+name → meta → slots+ping+enter)
  - selected = gold border + glow + 좌측 액센트
  - Pressable pressed 로 hover 대체
- Badge (normal/ranked/lock) + 슬롯 (gold gradient + glow) + 핑 (green when good)
- 검색/모드/빈자리/비밀방 필터 + 필터 재조정 시 selectedRoom 재계산
- ✅ tsc 0

## Phase 4: 우측 상세 패널 ✅
**커밋**: `91e81bc`
- 탭 (방 정보 / ＋ 방 만들기) — active = gold 하단 border + 옅은 골드 tint
- RoomInfoTab: 56x56 preview avatar + 방 이름 + 방장/레이팅, info grid 2x2, Team1/Team2 박스, 큰 입장 버튼, 푸터
- 빈 상태 처리
- RoomCreateTab + `CreateRoomForm` 인터페이스
  - 이름, 모드, 점수한도, 턴타이머, 관전허용, AI fill, 비밀번호
  - 이름 비면 disabled
  - TODO: server — 추가 필드 전달은 서버 확장 후
- 모든 터치 영역 ≥44x44
- ✅ tsc 0

## Phase 5: 인터랙션 + 모바일 시트 + 비밀번호 모달 ✅
**커밋**: `6033f7b`
- 더블탭 (300ms) → 즉시 입장
- 모바일: 방 카드 탭 → 풀스크린 RoomInfoTab 시트 (Modal slide)
- 모바일: FAB 골드 원형 버튼 → 풀스크린 RoomCreateTab 시트
- KeyboardAvoidingView (iOS) 로 입력 폼 보호
- 비밀번호 모달 통합 (모든 플랫폼)
  - autoFocus, returnKey=done 제출
  - gold gradient 입장 / ghost 취소, disabled 처리
  - 기존 onJoin(roomId, playerId, nickname, password) 시그니처 재사용
- ✅ tsc 0

## Phase 6: 기존 LobbyScreen 모달 제거 ✅
**커밋**: `55a0665`
- 제거: state (showRoom, customTab, newRoomName/Pw, joinPw, joinTarget, customRoomList, roomSearch)
- 제거: 5초 polling useEffect
- 제거: 전체 Modal JSX 블록 (~95줄)
- 제거: 미사용 스타일 (mTab*, mSec*) — mInput/mOk/mOkT/mOvl/mBox/mTitle 은 닉네임 편집 모달 유지용으로 보존
- 라우팅/트리거는 Phase 2 에서 이미 교체됨
- ✅ tsc 0, grep으로 잔존 레퍼런스 0 확인

## 최종 검증 ✅
- `npx tsc --noEmit` → **0 errors**
- `npx -y expo-doctor` → **17/17 passed**
- `grep` 로 잔존 `showRoom`/`customTab`/`joinTarget` 등 식별자 확인 → **0**
- 기존 동작하던 다른 화면 (lobby main, profile, ranking, shop, settings, game, result, terms) → **변경 없음**
- useSocket 콜백 (createCustomRoom/listRooms/joinRoom) 시그니처 → **불변**
- theme.ts 기존 `COLORS` → **불변**
- 반응형 — 3개 뷰포트 (desktop/tablet/mobile) 코드 내 분기 확인, 모든 컴포넌트 레벨에서 `useWindowDimensions + cmLayout` 사용

---

## 전체 커밋 히스토리 (브랜치)
```
55a0665 feat(custom-match): Phase 6 - remove old LobbyScreen modal
6033f7b feat(custom-match): Phase 5 - mobile sheets + password modal + interactions
91e81bc feat(custom-match): Phase 4 - right detail panel (info + create tabs)
f6798e8 feat(custom-match): Phase 3 - left room list (header + filters + cards)
52cbe6f feat(custom-match): Phase 2 — page skeleton + routing + responsive base
ba33880 feat(custom-match): Phase 1 — design tokens + gradient/blur deps
```

## 주의사항 / 향후 작업

### 서버 측 확장이 필요한 항목 (모두 `// TODO: server` 표시됨)
- `listRooms` 응답에 `host {name, level, rating}`, `mode`, `scoreLimit`, `turnTimer`, `allowSpectators`, `spectatorCount`, `players[team]`, `ping`, `createdAt` 추가
- `createCustomRoom` 요청에 `mode`, `scoreLimit`, `turnTimer`, `allowSpectators`, `aiFill` 추가
- 서버 확장 후에는 `src/utils/roomDataAdapter.ts` 의 `adaptServerRoom()` 본체만 수정하면 UI 는 그대로 동작
- `generateMockRooms()` 는 서버 응답이 비어있을 때만 fallback 으로 표시 — 서버 연동 정상화 후 주석/제거 가능

### 디자인
- 폰트: 현재 시스템 serif fallback (iOS Times New Roman, Android serif) + 기본 한글 폰트. Cinzel + Noto Sans KR 정식 설치는 별도 작업
- 애니메이션: Phase 5 의 Modal slide 외 추가 애니메이션 없음 (룰 5항 "여유 있으면" 에 해당, 스킵)

### 기타
- 현재 배포된 APK (ErrorBoundary 포함): https://expo.dev/accounts/rms1028/projects/tichu/builds/48ac88bd-a5c2-43df-a0b2-1a64f690d63e — 흰 화면 이슈는 사용자 설치 결과 대기 중, 이 작업과 무관하게 별도 디버깅 필요
- Railway 서버 상태 정상 (`cf73a6f` 배포 후)
- 본 작업 브랜치 `feat/custom-match-fullscreen` 은 master 로부터 분기, 리뷰 후 merge 또는 직접 fast-forward 가능
