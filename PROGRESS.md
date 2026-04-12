# Custom Match 풀스크린 리디자인 — 진행 상황

**브랜치**: `feat/custom-match-fullscreen`
**디자인 기준**: 사용자가 채팅으로 제공한 mockup HTML (inline content) — 파일로 저장 안 됨
**라우팅 패턴**: LobbyScreen 의 `page` state 에 `'customMatch'` 추가 (다른 페이지와 동일 패턴)

---

## Phase 1: 디자인 토큰 + 패키지 ✅
**커밋**: `ba33880`

- `theme.ts` 에 `cm*` prefix 토큰 30+ 추가 (cmBg0..3, cmGold/Soft/Deep, cmInk/Dim/Mute, cmLine/Strong, badge variants, ping good, topbar fallback)
- `CM_BREAKPOINTS` (desktop 1100, tablet 768) + `cmLayout(width)` 헬퍼
- `expo-linear-gradient ~14.0.2` 설치
- `expo-blur ~14.0.3` 설치 (iOS only, Android 는 단색 fallback)
- 기존 COLORS 변경 없음
- ✅ tsc 0, expo-doctor 17/17

## Phase 2: 페이지 골격 + 라우팅 + 반응형 기반 ✅
**커밋**: `52cbe6f`

- 신규: `src/utils/roomDataAdapter.ts`
  - `FullRoom` 인터페이스 + `adaptServerRoom()` (결정적 hash 기반 mock 보강)
  - `generateMockRooms()` 6개 데모 방
  - `pingQuality()`, `countWaitingPlayers()` 헬퍼
- 신규: `src/screens/CustomMatchScreen.tsx`
  - SafeAreaView + LinearGradient 배경 + 龍/鳳 한자 (opacity 0.025)
  - 상단바: 뒤로 + 브레드크럼 + 코인 (iOS BlurView, Android cmTopbarSolid)
  - 메인 영역: useWindowDimensions + cmLayout 반응형 split
    - Desktop ≥1100: row, 좌 flex 1 + 우 420
    - Tablet 768~1099: row, 우 360
    - Mobile <768: column, 우측 숨김 (Phase 5 에서 시트로)
  - 좌/우 placeholder, 첫 방 자동 선택, 10초 polling cleanup
- 수정: `LobbyScreen.tsx`
  - Page 타입에 `'customMatch'` 추가
  - 라우팅 한 줄 추가 (`if (page === 'customMatch')`)
  - 트리거 버튼 onPress 만 변경 (`setPage('customMatch')`)
  - 기존 모달 코드는 그대로 보존 (Phase 6 에서 제거)
- ✅ tsc 0

## Phase 3: 좌측 방 목록 ✅ → 진행 예정
- 섹션 헤더 (Cinzel-style 타이틀 + 액센트 바 + 카운터)
- 필터 바 (검색 + 전체/일반전/랭크 칩 + 토글 + 새로고침)
- 방 카드 컴포넌트 (아바타 + 정보 + 슬롯 + 핑 + 입장)
- 반응형: 데스크톱은 가로 카드, 모바일은 세로 카드

## Phase 4: 우측 상세 패널 ⏳
- 탭 (방 정보 / + 방 만들기)
- 방 정보 탭: 헤더 + info grid 2x2 + 팀 슬롯 + 입장 버튼
- 방 만들기 탭: 폼 + 제출

## Phase 5: 인터랙션 + 모바일 시트 ⏳
- 첫 방 자동 선택, 클릭/더블클릭, ESC, 10s polling 검증
- 모바일: 방 클릭 시 풀스크린 시트 (방 정보 + 방 만들기 모두)

## Phase 6: 기존 모달 제거 + 최종 회귀 ⏳
- LobbyScreen 의 showRoom/customTab/joinTarget 등 state + 모달 JSX 제거
- 회귀 검증

---

## 외부 참고

- 현재 배포된 APK (ErrorBoundary 포함, 사용자 검증 대기): https://expo.dev/accounts/rms1028/projects/tichu/builds/48ac88bd-a5c2-43df-a0b2-1a64f690d63e
- 본 작업과 무관한 흰 화면 이슈는 사용자 APK 검증 후 별도 디버깅 예정
- Railway 서버 상태: 정상 (cf73a6f 배포 후 회복)
