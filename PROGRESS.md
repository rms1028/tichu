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

## Phase 3: 좌측 방 목록 ✅
**커밋**: `f6798e8`
- 섹션 헤더 (액센트 바 LinearGradient + serif 타이틀 + ko 부제 + 카운터)
- 필터 바 (검색 input + 칩 가로 스크롤 + 새로고침 아이콘 버튼)
- Chip 컴포넌트 (active/pressed/dot variants)
- RoomCard 컴포넌트
  - 데스크톱/태블릿: 가로 그리드 (avatar | info | slots | ping | enter)
  - 모바일: 세로 배치 (avatar+name → meta → slots+ping+enter)
  - selected 상태 = gold 보더 + glow + 좌측 액센트 바
  - hover → Pressable pressed
- Badge (normal/ranked/lock) + 슬롯 (filled = gold gradient + glow) + 핑 (3 bars + ms text, good = green)
- 검색 + 모드 필터 + 빈자리만 + 비밀방 제외 작동
- 첫 방 자동 선택 + 필터 적용 시 selected 재조정
- ✅ tsc 0

## Phase 4: 우측 상세 패널 ✅
**커밋**: `91e81bc`
- 탭 (방 정보 / ＋ 방 만들기) — active = gold 하단 보더 + 옅은 골드 tint
- RoomInfoTab
  - Preview head: 56x56 avatar + 방 이름 + 방장·레이팅
  - Info grid 2x2: Mode / Score(gold) / Turn Timer / Spectators
  - Players section: Team1 / Team2 박스 (filled = mini avatar + 닉, empty = dashed + '＋ 빈자리')
  - 큰 입장 버튼 (gold linear-gradient + drop shadow)
  - footnote: 평균 핑
  - 빈 상태 처리
- RoomCreateTab + `CreateRoomForm` 인터페이스
  - 방 이름, 모드, 점수한도, 턴 타이머, 관전허용, AI fill, 비밀번호
  - submit 시 onCreateCustomRoom(name, password?, playerId, nickname) 호출 (기존 시그니처 유지)
  - TODO: server — 모드/점수/타이머 등 추가 필드는 서버 확장 후 전달
  - 이름 비어있으면 disabled
- 모든 터치 영역 ≥44x44
- ✅ tsc 0

## Phase 5: 인터랙션 + 모바일 시트 🚧
- 모바일에서 방 클릭 시 우측 패널이 풀스크린 시트로 표시 (Modal)
- 방 만들기도 모바일은 풀스크린 시트
- 비밀번호 입력 모달 통합
- 더블클릭 즉시 입장
- 폴링 cleanup 검증

## Phase 6: 기존 모달 제거 + 최종 회귀 ⏳
- LobbyScreen 의 showRoom/customTab/joinTarget 등 state + 모달 JSX 제거
- 회귀 검증

---

## 외부 참고

- 현재 배포된 APK (ErrorBoundary 포함, 사용자 검증 대기): https://expo.dev/accounts/rms1028/projects/tichu/builds/48ac88bd-a5c2-43df-a0b2-1a64f690d63e
- 본 작업과 무관한 흰 화면 이슈는 사용자 APK 검증 후 별도 디버깅 예정
- Railway 서버 상태: 정상 (cf73a6f 배포 후 회복)
