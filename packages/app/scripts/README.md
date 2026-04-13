# `scripts/` — Android dev automation

## `android-dev.mjs`

EAS 의존성 없이 Android 폰에서 한 명령으로 전체 dev 사이클 실행.

```bash
npm run android:dev
```

### 무엇을 하는가

1. `expo export --platform android` — Hermes bytecode 생성
2. 기존 base APK (네이티브 라이브러리 등 그대로) 안의 `assets/index.android.bundle` 만 새 bytecode 로 교체
3. `zipalign` + `apksigner` 로 debug 키스톤 서명
4. ADB 로 폰에 install + 실행
5. 스크린샷 + logcat 캡처 → `.android-dev/screenshots/`, `.android-dev/logs/` 에 타임스탬프로 저장
6. logcat 에서 JS 에러 자동 추출해서 터미널에 표시

한 사이클 ≈ 30~60초. EAS quota 0 사용.

### 왜 이게 필요한가

EAS Build 는 무료 플랜 한도 (월 N 회) + 빌드 시간 (15~25분) 때문에 흰 화면 디버깅 같은 빠른 iteration 에 부적합. 그런데 dev iteration 사이에 바뀌는 건 **JS 번들뿐** — 네이티브 라이브러리 (Hermes, mmkv, reanimated 등) 는 그대로다. 그러니 한 번 빌드한 EAS APK 를 "shell" 로 두고 JS 만 갈아끼우면 EAS 없이 똑같은 결과.

### 1회성 셋업

#### 1. Base APK 준비
EAS 로 한 번 빌드한 APK 를 `.android-dev/base.apk` 로 복사:

```bash
# 예시: 기존 다운로드한 EAS APK 를 옮김
cp /path/to/your-eas-build.apk packages/app/.android-dev/base.apk
```

> 이 base APK 는 **네이티브 의존성을 바꿀 때만** 다시 만들면 된다. 새 라이브러리 추가, expo SDK 업그레이드, app.json 변경 등에는 새 EAS 빌드 후 base.apk 교체.

#### 2. 폰 USB 디버깅
- 설정 → 휴대전화 정보 → 빌드번호 7번 탭 (개발자 옵션 활성)
- 개발자 옵션 → USB 디버깅 ON
- USB 케이블 연결 → "이 컴퓨터에서 항상 허용" 체크

#### 3. PATH 가 다음을 찾을 수 있어야 함 (자동 감지됨)
- Android SDK (`%LOCALAPPDATA%\Android\Sdk` 또는 `$ANDROID_HOME`)
- JDK (`Android Studio\jbr` 또는 `$JAVA_HOME`)
- Python 3 (zipfile 조작용)

### 옵션

| 환경 변수 | 동작 |
|---|---|
| `WAIT_MS=12000` | 첫 페인트 대기 시간 (기본 7000ms) |
| `SKIP_INSTALL=1` | APK 만 만들고 폰 설치 안 함 |

### 문제 해결

| 증상 | 원인 / 조치 |
|---|---|
| `Base APK missing` | `.android-dev/base.apk` 없음. 위의 1회성 셋업 참조. |
| `No authorized device` | `adb devices` 가 'device' 로 안 나옴. USB 케이블 / 디버깅 허용 팝업 확인. |
| `python: command not found` | Python 3 설치 후 PATH 에 추가. |
| 스크린샷이 검은 화면 | 폰 화면이 자고 있음. 스크립트가 KEYCODE_WAKEUP 보내지만 잠금 상태면 안 깨어남 — 폰을 잠금 해제해두기. |
| `Failed to extract native libraries` | `.so` 파일이 deflated 로 패킹됨. (스크립트가 자동으로 STORED 처리하므로 보통 안 발생) |

### 새 네이티브 의존성을 추가했다면

base APK 가 새 라이브러리의 `.so` 를 포함하지 않으므로 JS 만 갈아끼우는 방식이 안 통한다. 다음 둘 중 하나:

1. **새 EAS 빌드 → 새 base APK** (정공법, EAS quota 사용)
2. **`expo run:android`** — 로컬 Gradle 빌드 (NDK 설치 필요)

### 출력 파일 위치

- `packages/app/.android-dev/base.apk` — base APK (gitignored)
- `packages/app/.android-dev/work/` — 중간 산출물 (덮어씀)
- `packages/app/.android-dev/screenshots/` — 매 실행 스크린샷
- `packages/app/.android-dev/logs/` — 매 실행 logcat
