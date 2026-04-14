# 티츄(Tichu) — 모바일 멀티플레이어 보드게임

> 본 문서는 2026-04 기준 (`feat/custom-match-fullscreen` 브랜치) 의 실제 코드에 맞춰 재작성됨. 초기 버전은 `claude.md.bak` 에 보존. 게임 규칙 / 족보 로직 / 엣지 케이스 본문은 초기 문서에서 그대로 가져왔고, 메타 정보 (디렉토리/기술 스택/피처/운영 규칙) 만 실제 상태에 맞춰 갱신함.

---

## 1. 프로젝트 개요

4인 (2v2 팀전) 트릭테이킹 클라이밍 게임 '티츄' 의 모바일 멀티플레이어 구현.

**현재 상태:** 5차 작업 완료, 출시 준비됨. 게임 엔진 · 서버 · 클라이언트 · CI · 모바일 자동화 · 크래시 리포팅 · 운영 기능 (시즌/친구/업적/상점/출석/신고/커스텀매치/튜토리얼/푸시) 전부 구현 상태. 구현 순서를 논할 단계가 아닌 **운영·유지보수 단계**.

### 기술 스택 (실제 버전)

**클라이언트 (`packages/app`)**
- React Native 0.76.9 + Expo SDK 52 + React 18.3.1
- TypeScript 5.7 (strict)
- Expo Router 4 (파일 기반 라우팅)
- Zustand 5 (상태 관리)
- socket.io-client 4.8
- react-native-reanimated 3.16, react-native-gesture-handler 2.20
- react-native-mmkv 3.2 (영속 저장)
- expo-av 15 (사운드), expo-haptics 14, expo-notifications 0.29, expo-auth-session 6, expo-crypto 14, expo-web-browser 14
- firebase 12 (client), @sentry/react-native 6.10

**서버 (`packages/server`)**
- Node.js 20 (CI 기준), TypeScript 5.7
- socket.io 4.8
- Prisma 6.9 + PostgreSQL
- firebase-admin 13.7 (ID 토큰 검증)
- expo-server-sdk 6.1 (푸시 발송)
- tsx 4.19 (dev watch), vitest 3 (테스트)

**공유 (`packages/shared`)**
- 순수 TypeScript, RN / Node 양쪽에서 import. 외부 의존성 없음.

**모노레포:** npm workspaces (루트 `package.json` 에 `packages/shared`, `packages/server`, `packages/app` 등록). `postinstall` 훅이 설치 직후 `packages/shared` 를 자동 빌드 (다른 워크스페이스가 정적으로 의존하기 때문).

**디바이스 타깃:** Samsung 2340×1080 landscape 를 모바일 visual-test 좌표 기준으로 사용. 다른 디바이스로 돌리려면 `packages/app/scripts/visual-test.mjs` 의 tap 좌표 재튜닝 필요.

---

## 2. 디렉토리 구조 (실제)

```
tichu/
├── claude.md                         # 이 문서
├── claude.md.bak                     # 초기 버전 백업
├── PROGRESS.md                       # 작업 차수별 체크리스트 (1차 ~ 5차)
├── package.json                      # 루트 workspaces + postinstall
├── .github/workflows/ci.yml          # GitHub Actions (test-shared → test-server → typecheck-app → build)
├── .githooks/pre-commit              # RN 안전성 linter 호출
├── scripts/install-git-hooks.sh      # 1회성 훅 설치 ( core.hooksPath=.githooks )
└── packages/
    ├── shared/src/
    │   ├── types.ts                  # Card, PlayedHand, GamePhase 등
    │   ├── constants.ts              # 카드 값 · 점수 매핑
    │   ├── validate-hand.ts          # validateHand()
    │   ├── can-beat.ts               # canBeat()
    │   ├── valid-plays.ts            # getValidPlays(), getAvailableBombs()
    │   ├── wish.ts                   # mustFulfillWish()
    │   ├── scoring.ts                # 점수 정산
    │   ├── phoenix-utils.ts          # 봉황 대체 로직 공용 헬퍼
    │   ├── index.ts                  # 배럴 export
    │   └── *.test.ts                 # vitest 단위 테스트 (8 파일)
    │
    ├── server/
    │   ├── prisma/schema.prisma      # User · GameResult · Season · SeasonRanking · FriendRequest · Friendship · Report · Block · PushToken
    │   └── src/
    │       ├── index.ts              # 엔트리 (Express + socket.io + CORS + 헬스체크)
    │       ├── game-room.ts          # GameRoom · BombWindow · RoomSettings 타입 + 룸 생성/관리
    │       ├── game-engine.ts        # 상태 머신 + playCards/declareTichu/passTurn 파이프라인
    │       ├── bomb-window.ts        # startBombWindow · submitBomb · resolveBombWindow
    │       ├── socket-handlers.ts    # 모든 socket.io 이벤트 핸들러
    │       ├── bot.ts                # AI 봇 (easy / medium / hard)
    │       ├── db.ts                 # Prisma 접근 레이어 (User/GameResult/친구/신고/푸시토큰)
    │       ├── firebase-admin.ts     # Firebase Admin SDK 초기화 + ID 토큰 검증
    │       ├── friends.ts            # 친구 요청 · 수락 · 온라인 상태 · 초대
    │       ├── matchmaking.ts        # 랭크 매칭 큐 + 파티 구성
    │       ├── ranking.ts            # XP / 티어 / 시즌 점수 계산
    │       ├── season.ts             # 시즌 생성 · 리셋 · 랭킹 조회 · 보상 수령
    │       ├── scheduler.ts          # 백그라운드 잡 (시즌 리셋 등)
    │       ├── notification.ts       # Expo Server SDK 푸시 발송
    │       ├── logger.ts             # 로깅 유틸
    │       └── *.test.ts             # vitest (socket-sim 계열은 CI 에서 제외됨)
    │
    └── app/
        ├── app.json / eas.json       # Expo / EAS 빌드 프로필 (development / preview / production)
        ├── babel.config.js / metro.config.js
        ├── index.js                  # 모바일 엔트리 (CommonJS, 조기 에러 핸들러 + gesture-handler 초기화)
        ├── app/
        │   ├── _layout.tsx           # Expo Router 루트 레이아웃 (진단 화면)
        │   └── index.tsx             # Expo Router 홈 → AppRoot 렌더
        ├── src/
        │   ├── AppRoot.tsx           # 실제 앱 로직: 화면 전환 상태 머신 + 소켓 이벤트 dispatch
        │   ├── screens/              # 13 개 스크린 (아래 9장 참조)
        │   ├── components/           # 19 개 게임 UI + 모달 + 시스템 컴포넌트
        │   ├── stores/               # Zustand: gameStore · userStore · achievementStore
        │   ├── hooks/                # useSocket (400+ 줄 이벤트 리스너) · useGame
        │   └── utils/                # theme · responsive · sound · bgm · haptics · firebase · googleOAuth · notifications · sentry · globalErrorCapture · roomDataAdapter
        ├── scripts/
        │   ├── android-dev.mjs       # JS 번들 스왑 기반 Android 개발 사이클
        │   ├── visual-test.mjs       # pixelmatch 기반 visual regression
        │   ├── lint-rn-safety.mjs    # AST 기반 RN 크래시 패턴 차단 linter
        │   └── README.md             # 스크립트 셋업 가이드
        ├── visual-tests/baselines/   # 커밋된 regression baseline (01-splash / 02-login / 03-lobby)
        └── .android-dev/              # gitignored: base.apk · screenshots · logs
```

실제 파일 목록은 디렉토리 자체가 단일 소스. 이 문서의 구조 개요가 어긋날 경우 **코드가 맞다**.

---

## 3. 빌드 · 실행 명령어

```bash
# ─── 루트 (모노레포 위임) ───
npm install                        # 전체 설치 + postinstall 로 shared 자동 빌드
npm run build:shared               # packages/shared 만 빌드
npm run test:shared                # shared vitest
npm run dev:server                 # packages/server 개발 서버 (tsx watch)
npm run test:server                # server vitest
npm test                           # 모든 워크스페이스 test --if-present

# ─── packages/shared ───
cd packages/shared
npm run build                      # tsc
npm test                           # vitest run
npm run test:watch                 # vitest --watch

# ─── packages/server ───
cd packages/server
npm run dev                        # tsx watch src/index.ts (← CLAUDE 초기 버전엔 ts-node-dev 로 잘못 적혀 있었음)
npm run build                      # prisma generate + tsc
npm start                          # prisma db push + node dist/index.js
npm test                           # vitest run

# ─── packages/app (클라이언트) ───
cd packages/app
npx expo start                     # Metro 서버 (Expo Go 용)
npm run android                    # expo run:android (로컬 네이티브 빌드, NDK 필요)
npm run ios                        # expo run:ios
npm run typecheck                  # tsc --noEmit
npm run build                      # npx expo export --platform web

# ─── Android 모바일 자동화 (EAS 없이, base APK + JS 스왑) ───
cd packages/app
npm run android:dev                # bundle → APK 리패킹 → install → 스크린샷 + logcat 캡처
npm run android:visual             # 시나리오 기반 visual regression (pixelmatch)
npm run android:visual -- --update-baselines     # baseline 갱신
npm run android:visual -- --filter lobby         # 특정 시나리오만 실행
```

**환경 변수**
- `WAIT_MS=12000 npm run android:dev` — 첫 페인트 대기 시간 연장
- `SKIP_INSTALL=1 npm run android:dev` — APK 만 만들고 설치 생략

**Git 훅 1회성 셋업**
```bash
sh scripts/install-git-hooks.sh   # core.hooksPath=.githooks 적용
```
이후 `git commit` 시 `.githooks/pre-commit` 이 자동으로 `lint-rn-safety` 를 돌려 `packages/app/` 의 스테이징된 `.ts/.tsx` 파일을 검사.

---

## 4. 모바일 자동화

현재 repo 에 실제로 존재하는 자동화 전부. 파일 기반으로만 기술.

### 4.1. Git pre-commit hook — RN 크래시 패턴 차단

- **무엇을 하는지:** `packages/app/{src,app}/**/*.{ts,tsx}` 중 스테이징된 파일을 TypeScript AST 로 walk 해서 **모듈 최상위** 에서 호출되는 Web 전용 API (`window.addEventListener`, `document.*`, `localStorage.*`, `speechSynthesis.*`, `navigator.clipboard.*`, `new AudioContext()` 등) 를 차단. 2026-04-13 에 `sound.ts` / `bgm.ts` 의 top-level `window.addEventListener` 가 RN Bridgeless 모드에서 TypeError 를 던져 흰 화면을 만든 사건 이후 회귀 방지용으로 도입.
- **어떻게 실행:** `git commit` 시 자동. 수동 검사는 `node packages/app/scripts/lint-rn-safety.mjs <files...>` 또는 인자 없이 실행해 `packages/app/{src,app}/**/*.{ts,tsx}` 전부 스캔.
- **관련 파일:**
  - `scripts/install-git-hooks.sh` — 1회성 훅 설치
  - `.githooks/pre-commit` — 스테이징 필터링 + linter 호출
  - `packages/app/scripts/lint-rn-safety.mjs` — AST linter 본체 (DANGEROUS_CALLS / DANGEROUS_RECEIVERS / DANGEROUS_NEWS 세트)

### 4.2. `npm run android:dev` — EAS 없는 Android 개발 사이클

- **무엇을 하는지:** (1) `expo export --platform android` 로 Hermes bytecode 생성 → (2) 기존 base APK (`packages/app/.android-dev/base.apk`, 이전 EAS 빌드 산출물) 를 shell 로 두고 `assets/index.android.bundle` 만 교체 → (3) `zipalign` + `apksigner` 로 debug 키 서명 → (4) ADB install + launch → (5) `screencap` + `logcat` 캡처 → (6) logcat 에서 `ReactNativeJS` 에러 자동 추출. 한 사이클 ≈ 30~60 초, EAS quota 0 사용.
- **어떻게 실행:** `cd packages/app && npm run android:dev`. 옵션: `WAIT_MS=12000` (첫 페인트 대기), `SKIP_INSTALL=1` (설치 생략). 네이티브 의존성 (native 모듈, Expo SDK 등) 이 바뀌면 base APK 재생성 필요 — 새 EAS 빌드 후 `.android-dev/base.apk` 로 복사.
- **관련 파일:**
  - `packages/app/scripts/android-dev.mjs`
  - `packages/app/scripts/README.md`
  - `packages/app/.android-dev/{base.apk,screenshots/,logs/}` (모두 gitignored)

### 4.3. `npm run android:visual` — 시나리오 기반 visual regression

- **무엇을 하는지:** 설치된 APK 를 launch → 시나리오마다 `tap` / `text` / `keyevent` step 수행 → 스크린샷 캡처 → pixelmatch 로 `visual-tests/baselines/<scenario>.png` 대비 diff 계산 (`includeAA:false`, `threshold:0.1`, 상단 100px 마스킹해서 시계/배터리 변화 무시) → `DIFF_TOLERANCE_PCT=0.1` 이내면 pass. 실행 전후로 `systemui demo` 브로드캐스트로 status bar pin. 현재 10 개 시나리오: `01-splash` ~ `04-custom-match`, `05-rules`, `06-ranking`, `07-settings`, `08-shop`, `09-profile`, `10-achievements` (정적 화면만 — §4.4 의 idle state 제약 참조).
- **어떻게 실행:** `cd packages/app && npm run android:visual`. 옵션: `-- --filter <이름>`, `-- --update-baselines` / `-u`. 종료 코드 = fail 시나리오 개수.
- **관련 파일:**
  - `packages/app/scripts/visual-test.mjs` (러너 + SCENARIOS 배열, 좌표는 2340×1080 landscape)
  - `packages/app/visual-tests/baselines/` (커밋된 정답 PNG)
  - `packages/app/visual-tests/current/` (매 실행 캡처 + `.diff.png`, gitignored)

### 4.4. 모바일 UI 검증 표준 사이클

UI/레이아웃 수정 후에는 **코드 레벨 검증만으로 끝내지 말고** 반드시 실물 디바이스에서 확인한다:

1. `npm run android:dev` — 변경된 JS 번들로 APK 리패킹 후 설치 → 첫 페인트 스크린샷이 `packages/app/.android-dev/screenshots/` 에 저장
2. `npm run android:visual -- --filter <scenario>` — 기존 baseline 대비 diff 확인
3. diff 가 의도된 변경이면 `-- --update-baselines` 로 새 baseline 채택
4. 실제 스크린샷을 `Read` 툴로 열어 **눈으로** 레이아웃 확인 후 커밋

**알려진 제약 (검증 중 자주 걸리는 함정):**

- **`uiautomator dump` 의 "could not get idle state" 실패 — 원인은 Reanimated 뷰 자체가 아니라 _상시 업데이트되는 타이머/애니메이션_ 이 JS 스레드를 idle 시키지 못하는 것**. 2026-04-14 7차 작업 2단계 실측에서 규명:
  - 로비 → 커스텀 매치 / 랭킹 / 설정 등 **정적 화면** 에서는 dump 가 정상 작동함 (현재 baseline 10개가 증거)
  - **MatchmakingScreen / GameScreen** 은 초단위 elapsed 카운트다운 + turn timer 때문에 dump 가 **단 한 번도** 성공하지 못함 (10회 retry)
  - 단순히 "Reanimated 뷰 = 비노출" 이 아니라 **"idle state 가 확보되는 화면" 대 "절대 확보 안 되는 화면"** 의 구분임. 전자는 dump 로 좌표 추출 가능, 후자는 pixel analysis 만 가능하거나 test-mode 에서 타이머를 freeze 해야 함.
- **`adb shell input tap` 이 구조에 따라 hit-test 통과 못하는 경우** — 실측으로 확인 (2026-04-14):
  - tap 이벤트는 window 에 정상 전달됨 (logcat `InputDispatcher: Delivering touch to (pid): action: 0x0/0x1` 로 검증)
  - **nested flex-row 안의 TouchableOpacity** 는 특정 조건에서 ADB tap 에 반응 안 함. 구체적 증거: `MatchmakingScreen.S.hostActions` (flexWrap:'wrap', flex row) 내부의 셔플/봇 채우기/시작 3 버튼은 6개 좌표 × 3개 tap 방식 (`tap` / `touchscreen tap` / `swipe 1px`) 전부 실패. **같은 화면의 나가기** (flex row 밖, 직접 S.bottom 자식) 는 정상 작동.
  - 가설: secondly re-render 로 인한 View instance 재생성이 touch 이벤트와 race. flex-wrap container 의 hit-test 경로가 ADB 주입 타이밍과 맞지 않음. 물리 터치는 정상이지만 ADB 주입은 막힘.
  - **우회 방법:** 이런 화면은 test-mode deeplink 로 **우회** 한다. 카드 탭 / 버튼 탭을 직접 하지 말고, deeplink 파라미터로 테스트 상태를 강제 진입. (2단계 미완, 다음 세션에서 구현.)
- 로고 glow / 파티클 애니메이션 자체는 정적 화면에서는 idle state 확보를 방해하지 않음 — 실측 결과. 문제는 **초 단위로 props 가 바뀌는** 요소 (카운트다운 / timer).
- `showAttendance` 등 초기 모달은 `useEffect` 에서 한 틱 늦춰 마운트 (RN 0.76 Bridgeless Modal focus-steal 회피). 시나리오 timing 이 이에 의존.
- `adb shell input tap` 은 **현재 포커스 윈도우** 에 이벤트를 보냄. 다른 앱이 foreground 면 그 앱에 전달되므로 실행 전 `am force-stop` 으로 방해 앱 정리 필수.
- 저장된 nickname (`useUserStore.nickname`) 이 있으면 login 스크린을 건너뛰어 `03-lobby` 시나리오 tap 이 엉뚱한 위치에 꽂힌다 → 깨끗한 baseline 은 `pm clear com.tichu.app` 후 재생성. 그래도 stuck 상태면 `adb uninstall com.tichu.app && npm run android:dev` 로 완전 재설치 (Firebase Keystore 는 `pm clear` 로 안 지워질 수 있음).
- **ADB 위치 (자동 감지):** `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` / `$ANDROID_HOME` / `$ANDROID_SDK_ROOT`.

### 4.5. GitHub Actions CI — `.github/workflows/ci.yml`

`master` 로의 push/PR 에서 순차 실행:
1. `test-shared` — `npm run build -w packages/shared` + `npm test -w packages/shared`
2. `test-server` — shared 빌드 + `prisma generate` + vitest (`socket-sim.test.ts` / `socket-sim-100.test.ts` 는 CI 자원 초과로 제외)
3. `typecheck-app` — shared 빌드 + `cd packages/app && npx tsc --noEmit`
4. `build` — shared + prisma + `npm run build -w packages/server` (test-server / typecheck-app 의존)

로컬 재현은 각 job 의 명령을 개별 실행.

---

## 5. 게임 규칙

### 5.1. 기본
- 4명이 2팀 (마주 앉은 상대가 파트너), 목표 1,000점 선도달 팀 승리
- 각 라운드: 손패를 모두 먼저 소진하는 것이 목표

### 5.2. 카드 구성 (56장)
- **일반 52장:** 4문양 (검/별/옥/탑) × 13장 (2~A)
- **특수 4장:** 참새(1), 개(Dog), 봉황(Phoenix), 용(Dragon)
- **교환 시 특수 카드 포함 가능:** 참새, 개, 봉황, 용 모두 교환 대상에 포함
- 참새를 교환으로 넘기면 받은 플레이어가 첫 리드 의무를 갖는다

### 5.3. 서열
```
2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A
```
용은 싱글 최강. 특수 카드는 별도 규칙.

### 5.4. 특수 카드

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
  - 풀하우스: 트리플/페어 어디든 대체 가능. value 는 트리플 기준.
  - 연속페어: 어느 위치든 대체 가능. value 는 가장 높은 페어 숫자.
  - 스트레이트: 참새(1)와 동시 사용 가능 (예: 1+봉황(2)+3+4+5)
- **제한:** 폭탄 구성 불가, 특수카드 대체 불가. 점수: **-25점**
- **마지막 카드:** 제출 → 나감. -25점 포함 트릭 획득. 4등 시 획득 트릭 → 1등에게 양도.

#### 용 (Dragon)
- 싱글 전용, 값 무한대. 조합 불포함
- 트릭 승리 시 카드 더미를 **상대팀 1명에게 양도** (플레이어 선택). 상대 모두 나갔으면 먼저 나간 상대(finishOrder 기준)의 wonTricks 에 합산.
- **폭탄으로만 제압**. 점수: **+25점**
- **마지막 카드:** 나감 처리 + DRAGON_GIVE 선택. 타임아웃 → 랜덤 상대 자동 양도.

### 5.5. 족보 종류

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
- A는 스트레이트 최상위만. 순환(A-2-3) 불가. 최대 14장 (참새+봉황+2~A)

#### 폭탄
- **포카드:** 같은 숫자 4장. 높은 숫자 승.
- **스트레이트 플러시:** 같은 문양 연속 5장+. 모든 포카드보다 강. 장수 → 값 순 비교.
- 턴 외 인터럽트 가능 (즉시 처리, §6.6). 팀 무관. 봉황 포함 시 불성립. 개에 폭탄 불가.

### 5.6. 점수

| 카드 | 점수 |
|------|------|
| 5 | +5 |
| 10, K | +10 |
| 용 | +25 |
| 봉황 | -25 |
| 그 외 | 0 |

라운드 총합 항상 100점.

**티츄 보너스:** 스몰 +100/-100, 라지 +200/-200. **[커스텀] 팀 내 1명만 선언 가능** (라지/스몰 무관, 선착순). 서버에서 팀원 `tichuDeclarations` 확인 후 거부.

### 5.7. 라운드 종료 및 점수 정산

**종료:** 3인 나감 또는 1등+2등 같은 팀 (원투 피니시).

**원투 피니시 판정:** finishOrder 의 1등과 2등이 같은 팀인지로 판정.

| 상황 | 처리 |
|------|------|
| 원투 피니시 | 해당 팀 200점, 상대 0점 |
| 일반 종료 | 4등 남은 핸드 → 상대팀. 4등 획득 트릭 → **1등에게**. 나머지 자기 점수. |

**승리:** 누적 1,000점 이상 + 더 높은 팀. 동점 → 추가 라운드.

---

## 6. 상태 머신

### 6.1. 라운드 상태 흐름
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

### 6.2. 딜링
1. 셔플 후 8장씩 분배 → **라지 티츄 선언 기회** (8장만 본 상태)
2. 모두 응답 후 나머지 6장 추가 → 14장 완성
3. **스몰 티츄:** **본인이** 첫 카드 내기 전까지 선언 가능. 다른 플레이어가 이미 냈어도 무관.

### 6.3. 카드 교환
- 왼쪽 상대 1장, 파트너 1장, 오른쪽 상대 1장 (비공개)
- 특수 카드 포함 가능. 참새 교환 시 서버가 교환 후 참새 보유자 재탐색 → `currentTurn` 설정
- 타임아웃 (30초) → 서버 랜덤 교환

### 6.4. 트릭 진행
1. 참새 보유자 첫 리드 (자유 리드 — 참새 포함 의무 없음, 개 포함 모든 카드 허용)
2. 후속: 같은 타입+장수+더 높은 값, 또는 패스
3. 패스는 트릭 내 영구 탈락 아님 (다음 차례 재참여 가능)
4. **트릭 종료:** 마지막 제출자 제외 전 활성 플레이어 연속 패스. 제출자 나갔으면 활성 전원 패스.
5. **폭탄 인터럽트:** 카드가 바닥에 있는 동안 턴 외 플레이어도 즉시 폭탄 제출 가능. 상세는 6.6.
6. 2인만 남고 1인 패스 → 즉시 종료
7. 남은 2인 같은 팀 → 원투 피니시 확정, 즉시 라운드 종료

### 6.5. 트릭 내부 상태
```
LEAD → FOLLOWING → (PLAY/PASS 반복, 언제든 턴 외 폭탄 인터럽트 허용) → TRICK_WON → [DRAGON_GIVE] → LEAD
```

### 6.6. 폭탄 인터럽트 시스템

> **구현 주의:** 초기에는 "카드 제출 후 3초 BOMB_WINDOW 를 열어 동시 폭탄을 수집하고 최강만 적용" 방식으로 설계됐으나, 실제 런타임은 `socket-handlers.ts` 의 `submit_bomb` 가 **즉시 인터럽트 처리** 하는 방식으로 구현됨. `bomb-window.ts` 의 `startBombWindow` / `resolveBombWindow` / `afterBombWindowResolved` 는 현재 미사용 (유닛 테스트에서만 참조). `GameRoom.bombWindow` 필드와 `bomb_window_start` / `bomb_window_end` 이벤트는 클라이언트로 전달되지 않는다. 즉 "동시 복수 폭탄 수집" 은 현재 불가능하고, 먼저 도착한 폭탄이 즉시 적용된다.

**즉시 인터럽트 흐름:**
```
카드 제출 → 트릭 진행 (현재 턴 플레이어가 내거나 패스)
     ↑
     ← submit_bomb (턴 외, 팀 무관) → 즉시 검증 → canBeat? → 테이블 갱신
                                                         → 폭탄 낸 사람 다음 활성 플레이어에게 턴 이전
```

**규칙:**
1. 카드가 바닥에 있는 동안 언제든 submit_bomb 전송 가능 (현재 턴 플레이어가 아니어도, 패스한 플레이어도)
2. 현재 바닥보다 강한 폭탄만 허용 (`canBeat` 로 검증)
3. 폭탄 낸 플레이어가 트릭 주도권 획득, 턴은 **그 다음 활성 플레이어** 에게 이전 (`broadcastEvents(io, room, [{ type: 'your_turn', seat: nextSeat }])` 필수 — 2026-04-14 회귀: 파트너 차례에 인터럽트 폭탄 → 파트너 pass 거부 버그 참조)
4. 마지막 카드 제출 후 나감 + 다른 플레이어의 폭탄 → 나감 번복 불가, 트릭 귀속만 변경
5. 인터럽트 처리 중 기존 턴 타이머는 `clearTurnTimer` 로 정리되고, `handlePostPlay` 에서 새 플레이어 기준으로 풀 타이머 재시작
6. 동시에 여러 플레이어가 폭탄을 쏴도 먼저 도착한 것이 적용되면 그 다음 폭탄은 `canBeat` 에서 걸러짐 (같은 폭탄 값이면 거부). "동시 수집 후 최강만" 이 아니라 "선착순" 이다.

**미래 작업 시 유의:** 3초 윈도우 시스템을 복구하려면 `bomb-window.ts` 의 deferred 함수들을 다시 호출 경로에 연결하고, 클라이언트의 `bomb_window_start` / `bomb_window_end` 리스너 + store 액션을 새로 작성해야 한다. 현재는 전부 제거됨.

### 6.7. 턴 순서
- 좌석: 0(남), 1(동), 2(북), 3(서). 팀: (0,2) vs (1,3)
- 시계방향: 0→1→2→3→0. 나간 플레이어 스킵.

### 6.8. 트릭 종료 조건

마지막 제출자가 활성이면 `consecutivePasses >= activePlayers.length - 1`, 나갔으면 `>= activePlayers.length`. 나감 후 활성 플레이어 수 동적 재계산.

### 6.9. 원투 피니시 조기 감지

finishOrder 에 2명 이상 && 1등+2등 같은 팀 → 트릭 종료 후 ROUND_END.

### 6.10. 턴 타임아웃 자동 처리

- **리드:** 패스 불가 → 자동 플레이. 소원 활성+소원 숫자 보유 → 소원 숫자 싱글. 그 외 → 가장 낮은 싱글.
- **팔로우:** 자동 패스.

---

## 7. 서버 아키텍처

### 7.1. 서버 권위 모델
모든 게임 로직은 서버에서 실행/검증. 클라이언트는 입력+렌더링만 담당.

### 7.2. GameRoom 데이터 모델 (실제 `packages/server/src/game-room.ts` 기준)

```typescript
interface GameRoom {
  roomId: string;
  phase: GamePhase;
  players: Record<number, PlayerInfo | null>;
  teams: { team1: [0, 2]; team2: [1, 3] };
  hands: { [seat: number]: Card[] };
  pendingExchanges: { [seat: number]: {
    left: Card | null; partner: Card | null; right: Card | null;
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

  // 초기 CLAUDE.md 이후 추가된 필드:
  isFirstLead: boolean;                    // 라운드 첫 리드 여부
  hasPlayedCards: Record<number, boolean>; // 스몰 티츄 선언 자격 체크 (본인 플레이 여부)
  hostPlayerId: string | null;             // 커스텀 방 호스트
  createdAt: number;                        // 방 생성 시각 (유휴 정리용)
}

interface BombWindow {
  windowId: number;
  startedAt: number;
  duration: number;               // 3000ms
  currentTopPlay: PlayedHand;
  pendingBombs: { seat: number; bomb: PlayedHand; cards: Card[] }[];
  excludedSeat: number;           // 방금 카드 낸 플레이어
  outPlayerSeat?: number;         // 제출 후 나간 플레이어
}

interface RoomSettings {
  turnTimeLimit: number;            // 30000ms
  largeTichuTimeLimit: number;      // 15000ms
  exchangeTimeLimit: number;        // 30000ms
  dragonGiveTimeLimit: number;      // 15000ms
  wishSelectTimeLimit: number;      // 10000ms
  bombWindowDuration: number;       // 3000ms — deferred 폭탄 윈도우 시스템용 (현재 미사용, §6.6 참조)
  targetScore: number;              // 1000
  allowSpectators: boolean;
  botDifficulty: 'easy' | 'medium' | 'hard';
}
```

### 7.3. 서버 모듈 맵

| 파일 | 책임 |
|------|------|
| `index.ts` | Express + socket.io 부트스트랩, CORS, 헬스체크, 스케줄러 start |
| `game-room.ts` | GameRoom · BombWindow · RoomSettings 타입 + 방 생성/관리 |
| `game-engine.ts` | 상태 머신 + `playCards` / `declareTichu` / `passTurn` / `exchangeCards` / `dragonGive` 파이프라인 |
| `bomb-window.ts` | `startBombWindow` / `submitBomb` / `resolveBombWindow` / `afterBombWindowResolved` |
| `socket-handlers.ts` | 모든 socket.io 이벤트 라우팅 (join_room · play_cards · declare_tichu · 친구 · 랭킹 · 커스텀 매치 · 신고 등) |
| `bot.ts` | AI 봇 의사결정 (easy/medium/hard 난이도) |
| `db.ts` | Prisma 접근 레이어 |
| `firebase-admin.ts` | ID 토큰 검증 (Google OAuth) |
| `friends.ts` | 친구 요청/수락/거절/온라인 상태/초대 |
| `matchmaking.ts` | 랭크 매칭 큐 |
| `ranking.ts` | XP / 티어 / 시즌 점수 계산 |
| `season.ts` | 시즌 생성/리셋/리더보드/보상 수령 |
| `scheduler.ts` | 백그라운드 잡 (시즌 리셋 등) |
| `notification.ts` | Expo Server SDK 푸시 발송 |
| `logger.ts` | 로깅 유틸 |

### 7.4. Prisma 모델 (`packages/server/prisma/schema.prisma`)

`User`, `GameResult`, `Season`, `SeasonRanking`, `FriendRequest`, `Friendship`, `Report`, `Block`, `PushToken`

각 모델의 필드는 스키마 파일이 단일 소스. 운영 기능이 추가되면 스키마와 `db.ts` 를 같이 갱신.

### 7.5. play_cards / submit_bomb 파이프라인

단일 소스는 `game-engine.ts` 의 `playCards()` 와 `socket-handlers.ts` 의 `submit_bomb` 리스너. 문서에는 **비자명한 검증 순서** 만:

- **소원+개 리드 거부:** 소원 활성 + 본인 소원 숫자 실제 보유 + 개 리드 시도 → 거부
- **팔로우 시 소원 강제:** 소원 숫자 실제 보유 + 바닥 타입 맞는 포함 조합 존재 (봉황 보조 포함) 시 미포함 제출 거부. 폭탄으로만 가능하면 면제
- **소원 해제 타이밍:** 제출 카드에 소원 숫자 포함 시 즉시 해제 (폭탄 경로 포함)
- **나감 처리 순서:** hands 비면 finishOrder 추가 → 원투 체크 → 3인 나감 체크 → 트릭 종료 체크
- **submit_bomb:** §6.6 "즉시 인터럽트" 가 단일 설명. 핸들러는 `canBeat` 검증 후 테이블 갱신 + 다음 활성 플레이어로 `your_turn` emit. `bomb-window.ts` 의 deferred 경로는 미사용

### 7.7. declare_tichu 처리

```
1. 페이즈 검증: large → LARGE_TICHU_WINDOW, small → TRICK_PLAY|PASSING
2. 스몰: 본인이 카드 낸 적 있으면 거부 (다른 플레이어 무관)
3. 스몰: `finishOrder.length > 0` 이면 거부 (`someone_already_finished`) — 1등 확정 후 선언은 무조건 -100 이므로 사용자 실수 방지
4. 본인 중복 거부
5. [커스텀] 팀원 (seat+2%4) 선언 확인 → 있으면 거부 (`teammate_already_declared`)
6. 적용 + 브로드캐스트
```

### 7.8. 정보 가시성 필터링

- `myHand`: 내 카드만 전체 공개
- `otherHandCounts`: 타인은 장수만
- `tableCards`, `currentTrick`, `wish`, `tichuDeclarations`, `finishOrder`, `scores`: 공개
- `wonTrickSummary`: 획득더미 요약만 (count, points)
- `canDeclareTichu`: 본인 미선언 + 팀원 미선언 + 본인 미플레이

### 7.9. 동시성 처리

- 턴 타임아웃: `turnId` incrementing counter 로 stale 콜백 차단
- 폭탄 인터럽트: 즉시 처리 (§6.6), 기존 턴 타이머를 `clearTurnTimer` 로 정리 후 `handlePostPlay` 에서 새 턴 타이머 시작
- 용 양도/소원 모달: 각각 `timerId` 로 보호

### 7.10. 교환 후 첫 리드 결정

교환 완료 후 참새 보유자 탐색 → `currentTurn` 설정. `PASSING → TRICK_PLAY` 전환 시 호출.

---

## 8. 소켓 통신 프로토콜

### 8.1. 클라이언트 → 서버

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

피처 시스템 (친구 / 랭킹 / 커스텀매치 / 신고 / 상점 / 출석 / 푸시토큰 등) 의 이벤트는 개수가 많고 실제 구현이 단일 소스 — `packages/server/src/socket-handlers.ts` 와 `packages/app/src/hooks/useSocket.ts` 를 참조.

### 8.2. 서버 → 클라이언트 (코어 게임)

`room_joined`, `game_state_sync` (재접속 스냅샷), `state_delta`, `cards_dealt`, `large_tichu_prompt`, `exchange_prompt`, `exchange_received`, `your_turn` (+유효 플레이 힌트), `card_played` (seat, hand, remainingCards), `player_passed`, `trick_won` (winningSeat, cards, points), `player_finished` (seat, rank), `round_result`, `game_over`, `invalid_play` (reason), `wish_active` / `wish_fulfilled`, `dragon_give_required`, `player_disconnected` / `player_reconnected` / `bot_replaced`, `tichu_declared`, `bomb_played` (seat, bomb), `one_two_finish`, `auto_action` (seat, action, cards?)

※ `bomb_window_start` / `bomb_window_end` 는 `game-engine.ts` 의 `GameEvent` 타입에는 남아 있지만 런타임에 발생하지 않음 (§6.6). 클라이언트도 리스너 없음.

### 8.3. 델타 vs 스냅샷
- **스냅샷:** 재접속/방 참가 시 1회
- **델타:** 일반 진행 중 변경분만
- **개별 이벤트:** `card_played`, `trick_won`, `bomb_played` 등은 애니메이션/햅틱 트리거용

### 8.4. 공통 타입

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
  // 폭탄 비교: type 으로 구분 (SF > 포카드). 같은 타입이면:
  //   four_bomb: value = rank 값 (2~14). 높은 value 승.
  //   straight_flush_bomb: length 먼저 비교 (긴 쪽 승), 같으면 value (최고 카드 값) 비교.
}

type GamePhase = 'WAITING_FOR_PLAYERS'|'DEALING_8'|'LARGE_TICHU_WINDOW'|'DEALING_6'|'PASSING'|'TRICK_PLAY'|'ROUND_END'|'SCORING'|'GAME_OVER';
type TrickPhase = 'LEAD'|'FOLLOWING'|'TRICK_WON'|'DRAGON_GIVE';
```

---

## 9. 클라이언트 구조

### 9.1. 엔트리 이중 구조 (non-obvious)

모바일 앱의 진입점이 세 단계로 쌓여 있다 — **임의로 순서를 바꾸면 흰 화면 크래시가 재발** 한다:

1. **`packages/app/index.js`** (CommonJS) — OS 가 처음 로드하는 파일. 여기서:
   - `installGlobalErrorHandler()` 를 최상단에서 호출해 이후 어떤 크래시가 나도 잡는다
   - `react-native-gesture-handler` 를 import (반드시 다른 모듈보다 먼저)
   - expo-router 런타임을 초기화
2. **`packages/app/app/_layout.tsx`** — Expo Router 루트 레이아웃. 진단용 에러 화면 + `GestureHandlerRootView` 로 감싸고 `<Stack />` 렌더.
3. **`packages/app/app/index.tsx`** — Expo Router 의 홈 라우트. `<AppRoot />` 를 렌더.
4. **`packages/app/src/AppRoot.tsx`** — 실제 앱 로직. `ErrorBoundary` + `ToastProvider` + 화면 전환 상태 머신 (`splash → login → lobby → matchmaking → game → result`) + 소켓 이벤트 dispatch.

Expo Router 와 기존 수동 화면 전환이 병행되는 이유: 파일 라우팅은 진단·배포·딥링크용 shell 만 담당하고, 실제 게임 화면 전환은 `AppRoot` 안의 state 머신이 담당하기 때문 (리패킹 사이클 중에 라우터 재설정 비용을 피하기 위한 의도적 분리).

### 9.2. 화면 (`packages/app/src/screens/`)

13 개 스크린:

| 스크린 | 역할 |
|--------|------|
| `SplashScreen.tsx` | 로딩 / 버전 체크 |
| `LoginScreen.tsx` | 닉네임 입력 + Google OAuth / 게스트 로그인 |
| `LobbyScreen.tsx` | 메인 로비 (빠른 매칭 · 커스텀 · 친구 · 출석 · 상점/랭킹/설정 탭) |
| `MatchmakingScreen.tsx` | 매칭 큐 대기 화면 |
| `CustomMatchScreen.tsx` | 커스텀 방 목록 + 방 생성 (`feat/custom-match-fullscreen` 의 재설계 대상) |
| `GameScreen.tsx` | 실제 게임 테이블 |
| `GameResultScreen.tsx` | 라운드/게임 결과 정산 |
| `RulesScreen.tsx` | 게임 규칙 / 도움말 |
| `RankingScreen.tsx` | 시즌 리더보드 |
| `AchievementsScreen.tsx` | 업적 목록 + 수령 |
| `ShopScreen.tsx` | 아바타 · 카드백 구매 |
| `ProfilePage.tsx` | 프로필 · 통계 · 칭호 |
| `TermsScreen.tsx` | 이용약관 |

### 9.3. 컴포넌트 (`packages/app/src/components/`)

게임 UI, 모달, 시스템 컴포넌트 19 개. 주요 분류:

- **카드/테이블:** `CardView`, `PlayerHand`, `OpponentHand`, `TableArea`, `ExchangeView`
- **액션/타이머:** `ActionBar`, `CircleTimer`, `ScoreBoard`
- **모달 (전부 네이티브 Modal 이 아닌 absolute overlay View — 6.5 의 touch-lock 사고 참조):** `LargeTichuModal`, `DragonGiveModal`, `TutorialModal`, `AchievementPopup`
- **오버레이/이벤트:** `GameEventOverlay`, `EmotePanel`, `ToastSystem`, `DisconnectOverlay`
- **시스템:** `ErrorBoundary`, `BackgroundWatermark`, `ParticleEffect`

### 9.4. Zustand 스토어 (`packages/app/src/stores/`)

- **`gameStore.ts`** — 현재 게임 상태 (roomId, mySeat, phase, hands, tableCards, wish, tichuDeclarations, scores, bombWindow, 친구 데이터, 랭킹 데이터 등). 서버로부터 오는 스냅샷/델타를 직접 반영.
- **`userStore.ts`** — 유저 프로필 (playerId, nickname, coins, xp, 티어, 출석, 상점 인벤토리, 설정, 아바타/카드백). MMKV 로 영속화.
- **`achievementStore.ts`** — 업적 진행도와 최근 해금 이력.

### 9.5. Hooks (`packages/app/src/hooks/`)

- **`useSocket.ts`** — 소켓 연결 라이프사이클 + 모든 서버 이벤트 리스너 (400+ 줄). 연결 재시도, `rejoin_room` 자동, 버전 체크, `guest_login` 포함. 재접속 시 서버가 재시작됐으면 전체 상태 snapshot 으로 복구.
- **`useGame.ts`** — 게임 상태 파생 헬퍼 (유효 플레이, 내 차례 여부 등).

### 9.6. Utils (`packages/app/src/utils/`)

- **`theme.ts`** — 색상 · 타이포 상수
- **`responsive.ts`** — `useResponsive()` (window dimensions 기반 `isLandscape` / `isShort` / `isNarrow`)
- **`sound.ts`** · **`bgm.ts`** — 효과음 / 배경음 (둘 다 **module-load 시점에 Web API 호출 금지** — 아래 13장 참조)
- **`haptics.ts`** — expo-haptics 래퍼
- **`firebase.ts`** · **`googleOAuth.ts`** — Firebase 클라이언트 초기화 / Google 로그인 flow
- **`notifications.ts`** — expo-notifications 권한 + 토큰 획득
- **`sentry.ts`** — Sentry 초기화 (`initSentry`) + 브레드크럼 + 유저 식별
- **`globalErrorCapture.ts`** — 조기 에러 핸들러 (`installGlobalErrorHandler`) — index.js 에서 제일 먼저 호출됨
- **`roomDataAdapter.ts`** — 서버 `RoomListEntry` → 클라이언트 `Room` 변환 (커스텀 매치 목록용)

---

## 10. 피처 시스템

게임 코어 외에 현재 repo 에 완전 구현되어 있는 운영 피처 9 개. 세부 규칙은 코드가 단일 소스 — 이 섹션은 "어떤 피처가 있고, 어디에 있는지" 만 기록한다.

1. **시즌 / 랭킹** — 시즌 생성·리셋·리더보드·보상. 참조: `packages/server/src/{season,ranking,scheduler}.ts`, `packages/app/src/screens/RankingScreen.tsx`
2. **친구 시스템** — 친구 요청/수락/거절, 온라인 상태, 방 초대, 친구 코드 검색. 참조: `packages/server/src/friends.ts`, `packages/server/prisma/schema.prisma` 의 `FriendRequest` / `Friendship`, `packages/app/src/screens/LobbyScreen.tsx` 의 친구 패널
3. **업적** — 진행도 트래킹 + 해금 팝업. 참조: `packages/app/src/stores/achievementStore.ts`, `packages/app/src/screens/AchievementsScreen.tsx`, `packages/app/src/components/AchievementPopup.tsx`
4. **상점** — 아바타 / 카드백 구매 + 장착. 참조: `packages/app/src/screens/ShopScreen.tsx`, `packages/app/src/stores/userStore.ts` 의 `SHOP_AVATARS` / `equippedAvatar` / `coins`
5. **출석 체크** — 일일 출석 + 보상. 참조: `packages/app/src/stores/userStore.ts` 의 `attendanceStreak` / `lastAttendanceDate` / `checkAttendance` / `claimAttendance`, `LobbyScreen` 의 attendance 모달
6. **신고 / 차단** — 신고 접수 + 차단 리스트. 참조: `packages/server/prisma/schema.prisma` 의 `Report` / `Block`, 서버 쪽 socket-handlers, 앱쪽 신고 UI
7. **커스텀 매치** — 방 생성 · 목록 조회 · 비밀번호 · 코드 입장. 참조: `packages/app/src/screens/CustomMatchScreen.tsx`, `packages/server/src/socket-handlers.ts`, `packages/server/src/custom-match-v3.test.ts`
8. **튜토리얼** — 초보자 가이드 모달. 참조: `packages/app/src/components/TutorialModal.tsx`
9. **푸시 알림** — 초대 · 매칭 · 게임 시작 · 친구 알림. 참조: `packages/server/src/notification.ts`, `packages/server/prisma/schema.prisma` 의 `PushToken`, `packages/app/src/utils/notifications.ts`

각 피처의 세부 로직 (시즌 주기·점수 공식·상점 가격·업적 조건·알림 트리거 등) 은 코드에 묻는다. 이 문서에 박제하면 금방 드리프트한다.

---

## 11. 족보 검증 로직

단일 소스는 `packages/shared/src/` — 세부 알고리즘은 코드 + 테스트가 박제.

| 함수 | 파일 | 역할 |
|------|------|------|
| `validateHand(cards, phoenixAs?)` | `validate-hand.ts` | 카드 배열 → `PlayedHand` 또는 `null`. 봉황 대체 후 폭탄 금지, A 순환 금지, 참새 최하위만 |
| `canBeat(current, played)` | `can-beat.ts` | 폭탄 우선순위 (SF > 포카드), 같은 타입은 장수/value 비교. 리드(null) → 항상 true |
| `getValidPlays(hand, table, wish)` | `valid-plays.ts` | 핸드에서 합법 플레이 전체 생성. 바닥 있으면 `canBeat` 으로 필터 |
| `getAvailableBombs(hand, table)` | `valid-plays.ts` | 턴 외 폭탄 인터럽트 UI 용. 바닥보다 강한 폭탄만 |
| `mustFulfillWish(hand, table, wish, isLead)` | `wish.ts` | 소원 강제 판정 |

**소원 강제의 비자명한 규칙** (코드만 봐선 놓치기 쉬움):

- **"보유" 의 정의:** 핸드에 소원 숫자의 실제 일반 카드가 있어야 함. 봉황만으로는 "보유" 아님
- **팔로우:** 실제 보유 + 바닥 족보에 맞는 합법 조합 (봉황 보조 포함) 존재 → 강제. 폭탄으로만 가능 → 면제
- **리드:** 실제 보유 → 반드시 포함 리드. 면제 없음. 개 리드 불가
- **해제:** 해당 숫자 플레이 시 (폭탄 포함) 즉시 해제. 라운드 종료 시 자동 해제

**봉황 대체 규칙:** 풀하우스는 트리플/페어 어느 쪽이든 가능 (value 는 트리플). 연속페어는 어디든 가능. 스트레이트는 참새(1)와 동시 사용 가능.

---

## 12. 엣지 케이스

> 원본 57 케이스 표는 `claude.md.bak` §12 에 전체 보존. 단일 소스는 `packages/shared/*.test.ts` (족보 / 소원 / 폭탄) 와 `packages/server/src/*.test.ts` (트릭 종료 / 원투 / 네트워크). 아래는 코드만 봐서는 안 보이는 **비자명한 규칙 요약** 만.

- **개 리드 이전 (파트너 나감):** 파트너 seat 기준 시계방향 다음 활성 플레이어 — 본인 기준 아님
- **봉황 싱글 float:** 직전값 +0.5 (리드 시 1.5). 용 위 불가. A 위 = 14.5 → 용/폭탄으로만 제압
- **용 트릭 양도:** 상대 모두 나감 시 **먼저 나간 상대 (finishOrder 기준)** 의 wonTricks 에 합산
- **개만 남음:** 팔로우는 패스만, 리드권 얻으면 개 리드 가능. 못 얻으면 4등 (개는 0점이라 상대팀 양도)
- **봉황 마지막 카드:** 나감 + -25점 트릭 획득. 4등 시 획득 트릭 전부 1등에게 양도
- **소원 강제 전제:** 핸드에 실제 일반 카드 보유가 조건. 봉황만으로는 "보유" 아님 (§5.4, §11.4)
- **소원 면제:** 폭탄으로만 충족 가능 시 면제. 리드 시에는 면제 없음 (개 리드도 불가)
- **4장 모두 소진된 숫자 소원:** 선언 가능, 라운드 끝까지 미충족 자동 해제
- **폭탄 인터럽트 = 선착순** (§6.6). 동시 복수 폭탄 수집 없음. 팀원에게도 가능
- **폭탄 인터럽트 + 마지막 카드 나감:** 나감 번복 불가, 트릭 귀속만 변경
- **티츄 [커스텀]:** 팀 내 1명만 선언 가능 (라지/스몰 무관, 선착순 — `teammate_already_declared`)
- **원투 피니시 판정:** finishOrder 의 1등+2등 같은 팀 → 200:0
- **A 순환 스트레이트 금지** (A-2-3 불가). A 는 스트레이트 최상위만
- **리드 타임아웃:** 자동 플레이 (참새 / 소원숫자 / 최저 싱글 순). 팔로우 타임아웃은 자동 패스
- **재접속:** 카드 제출 직후 끊겨도 서버 상태는 유효. `game_state_sync` 로 복구
- **DRAGON_GIVE / 소원 선택 / 교환 타임아웃:** 각각 랜덤 상대 / 소원 안 함 / 랜덤 교환

---

## 13. 최근 사고 이력 (박제용)

2026-04 PROGRESS 차수 작업에서 실제로 하루씩 갉아먹은 함정들. **같은 사고를 두 번 내지 말자.**

1. **`sound.ts` / `bgm.ts` 흰 화면** — module 최상위에서 `typeof window !== 'undefined'` 가드 뒤에 `window.addEventListener(...)` 를 호출했는데, RN 0.76 Bridgeless 의 `window` polyfill 은 빈 객체라 가드를 통과하고 `addEventListener` 가 `undefined` 라 `TypeError: undefined is not a function` → 모듈 로드 실패 → AppRoot 가 mount 되기 전 흰 화면. **교훈:** top-level Web API 는 `typeof x.method === 'function'` 까지 검사. 단순 `typeof !== 'undefined'` 는 polyfill 때문에 의미 없음. pre-commit hook (§4.1) 이 이 패턴을 AST 로 차단.
2. **`setTimeout` 32-bit overflow** — duration=0 / `Infinity` / 매우 큰 값이 그대로 `setTimeout` 에 들어가면 Node/RN 둘 다 16 ms 로 clamp 되거나 즉시 발화 → 타이머 로직이 엉킴. **교훈:** duration 0 또는 무제한은 sentinel 로 처리 (타이머 걸지 않음) + `MAX_SAFE_TIMEOUT_MS` 가드 (2^31-1 = 약 24.8일 이하) 를 통과한 값만 `setTimeout` 에 전달.
3. **`playLock` 영구 잠김** — 카드 제출 직후 클라이언트가 `playLock=true` 로 전환했는데 서버가 `invalid_play` 로 거부하면 lock 이 풀리지 않아 이후 모든 제출이 막힘. **교훈:** lock 은 `lockBriefly()` 패턴 — 짧은 타임아웃 안에 서버 응답이 안 오거나 거부되면 자동 해제. 영구 lock 금지.
4. **`turnDuration` truthy 체크** — 설정에서 `turnDuration: 0` 이 "무제한" 의미로 쓰였는데 `if (turnDuration)` 으로 체크해 0 을 falsy 로 떨어뜨리는 바람에 "무제한 = 타이머 없음" 케이스가 꺠짐. **교훈:** 0 을 허용할 숫자 옵션은 `!== undefined` / `!= null` 로 명시적 체크. `if (value)` 금지.

---

## 14. 코딩 규칙 + 운영 규칙

### 14.1. 코드 컨벤션

- **언어:** TypeScript strict 모드, `any` 사용 금지
- **테스트:** vitest. 족보 엔진은 단위 테스트 100% 커버리지 목표
- **함수:** 순수 함수 우선. 게임 로직은 부수효과 없이 `shared` 에서 검증 후 `server` 에서 상태 변경
- **네이밍:** `camelCase` (변수/함수), `PascalCase` (타입/인터페이스), `UPPER_SNAKE_CASE` (상수)
- **서버 에러 처리:** 유효하지 않은 플레이는 `invalid_play` 이벤트로 거부. **절대 크래시하지 않음**
- **주석:** 엣지 케이스 처리 시 12 장의 케이스 번호를 주석에 명시 (예: `// Edge #11: 개만 남은 경우`). 그 외엔 기본적으로 주석 쓰지 말고, 의도가 비자명한 경우에만 한 줄

### 14.2. React Native 0.76 Bridgeless 규칙

- **네이티브 `<Modal>` 금지.** RN 0.76 + New Arch + Bridgeless 에서 `<Modal visible={true}>` 가 첫 렌더에 활성화되면 Android Dialog 가 부모 window focus 를 훔쳐 gesture state 가 "DOWN" 으로 stuck — 이후 모든 탭이 `Got DOWN touch before receiving UP or CANCEL` 로 거부된다. 대체: `position: 'absolute'` + `zIndex` 로 쌓는 overlay `View`. `LargeTichuModal` / `DragonGiveModal` / `TutorialModal` / `AchievementPopup` / 출석 모달 전부 이 규칙을 따른다.
- **초기 모달은 한 틱 늦춰 마운트.** `showAttendance` 같이 `useEffect` 안에서 조건부로 띄우는 모달은 `useState(false)` 로 시작 후 mount 이후 `setShowAttendance(true)`. 첫 렌더에 `visible=true` 로 시작하면 위 focus-steal 버그가 재현됨.
- **Top-level Web API 호출 금지.** `window.*`, `document.*`, `localStorage.*`, `new AudioContext()` 등 — 함수 안에 넣거나 `typeof fn === 'function'` 까지 가드. pre-commit hook 이 AST 로 차단.

### 14.3. Sentry / 전역 에러 핸들링 순서

`packages/app/index.js` 최상단 → `AppRoot` 최상단 순서로 다음 두 호출이 **정확한 순서로** 일어나야 한다:

1. `installGlobalErrorHandler()` — `packages/app/src/utils/globalErrorCapture.ts`. 가장 먼저 붙어야 이후 어떤 모듈 로드 에러도 잡을 수 있다.
2. `initSentry()` — `packages/app/src/utils/sentry.ts`. `installGlobalErrorHandler` **직후** 에 호출. 순서가 바뀌면 초기 크래시가 Sentry 로 올라가지 않음.

이 순서는 2026-04 의 흰 화면 디버깅 때 박제된 것. 순서를 바꾸지 말 것.

### 14.4. 회귀 금지 (작업 원칙)

- 기능을 추가하거나 버그를 고치는 중에 **기존에 작동하던 것이 깨지면 안 된다**. 특히 로비 / 게임 / 커스텀 매치 / 로그인 경로.
- UI 레이아웃 수정 후에는 실물 디바이스에서 §4.4 의 표준 사이클을 돌려 회귀 확인.
- 타입체크 + 테스트가 통과했다고 "feature 정상 작동" 은 아니다 — UI 는 직접 눈으로 확인해야 한다.

### 14.5. 실물 디바이스 검증 필수

모든 UI/레이아웃/인터랙션 변경은 `npm run android:dev` 로 리패킹 후 실물 폰에서 확인한 다음에 커밋. 코드 계산만으로 "fit 한다" 를 확정하지 말 것. 자동화가 이미 준비되어 있으므로 (§4.2, §4.3) 검증 비용은 낮다.

### 14.6. 커밋 / 브랜치

- 커밋 메시지는 `type(scope): subject` 형식 (`fix(mobile): ...`, `docs(claude.md): ...`, `feat(sentry): ...`)
- 사용자가 명시적으로 요청하지 않는 한 **자동으로 커밋하지 않는다**
- `--amend` 금지 (재실행 중 기존 히스토리를 덮어쓸 위험). 새 커밋을 만들기
- `master` 로는 직접 push 금지, feature 브랜치 + PR

---

## 15. 백업 / 이 문서의 유래

- **`claude.md.bak`** — 프로젝트 초반에 작성된 초기 버전 CLAUDE.md. 게임 규칙의 원본 기술 문서로서 기록 가치가 있음. 수정하지 말 것.
- 본 `claude.md` 는 2026-04 / `feat/custom-match-fullscreen` 브랜치 기준으로 재작성된 것이며, 이후 기능 추가 시에는 "피처 시스템" (§10) 또는 "최근 사고 이력" (§13) 에 한 줄씩 박제하는 식으로 갱신하면 된다. 세부 구현을 이 문서에 박제하면 금방 드리프트하므로, 항상 **코드가 단일 소스** 라는 원칙을 유지할 것.
