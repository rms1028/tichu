# Play Store 스크린샷 세트

Samsung SM-S931N (1080×2340 portrait) 에서 실물 캡처. Google Play Console / App Store Connect 에 그대로 업로드 가능.

## 포함된 8장

| # | 파일 | 화면 | 출처 |
|---|---|---|---|
| 1 | `01-lobby.png` | 메인 로비 (빠른 매칭 + 커스텀 모드) | visual-test baseline |
| 2 | `02-custom-match.png` | 커스텀 매치 (방 만들기 빈 상태) | visual-test baseline |
| 3 | `03-ranking.png` | 랭킹 리더보드 (#21 tester) | visual-test baseline |
| 4 | `04-shop.png` | 상점 — 아바타 10종 | visual-test baseline |
| 5 | `05-rules.png` | 게임 규칙 개요 | visual-test baseline |
| 6 | `06-card-exchange.png` | 카드 교환 + Bot-A 라지 티츄 선언 배지 | 실제 게임플레이 |
| 7 | `07-trick-play.png` | 트릭 플레이 — Bot-A A 풀하우스 + 봉황/용 손패 | 실제 게임플레이 |
| 8 | `08-small-tichu-prompt.png` | 스몰 티츄 선언 확인 모달 (±100 스코어) | 실제 게임플레이 |

## Play Store 규격 체크

- **크기**: 모두 1080×2340 (9:19.5) portrait PNG
- **최소 2장, 최대 8장** 요구 — 8장 전부 제출 가능
- **각 변 320~3840px 이내** ✓
- **종횡비 최신 Android 기기 허용** ✓ (9:19.5 는 Google Pixel 9 / Galaxy S25 등 2024+ 기기 표준)

만약 Play Console 이 9:19.5 를 거부한다면 (구식 9:16 만 받는 레거시 심사 계정), ImageMagick 등으로 상단/하단 크롭:
```bash
# 1080×1920 (9:16) 으로 크롭
magick 01-lobby.png -gravity center -crop 1080x1920+0+0 01-lobby-9x16.png
```

## 재생성 방법

정적 화면 (1~5): `npm run android:visual -- --update-baselines` 후 `packages/app/visual-tests/baselines/` 에서 복사.

게임플레이 (6~8): 실물 디바이스에서 아래 순서로 ADB 자동화:
```bash
# 빠른 매칭 → 봇 자동 채움 (약 60초) → 교환 → 트릭 플레이
adb shell am force-stop com.tichu.app && adb shell am start -n com.tichu.app/.MainActivity
# (로그인 + 출석 claim 생략)
adb shell input tap 315 1180   # 빠른 매칭 플레이
sleep 60
adb exec-out screencap -p > 06-card-exchange.png
sleep 15
adb exec-out screencap -p > 07-trick-play.png
adb shell input tap 380 1340   # 스몰 티츄 선언 가능 버튼
adb exec-out screencap -p > 08-small-tichu-prompt.png
```

## 미포함 (선택 추가 컷)

다음 장면은 타이밍이 어려워 제외됐으나, 직접 플레이 중 수동 캡처하면 훌륭한 스크린샷이 됩니다:

- **폭탄 인터럽트 순간** — 턴 외 플레이어가 폭탄 제출해 테이블이 바뀌는 순간
- **용(Dragon) 제출 + 양도 모달** — DRAGON_GIVE 프롬프트
- **라운드 종료 스코어 정산** — 1:1 티츄 + 원투피니시 등 극적인 결과
- **게임 최종 승리 화면** (1000점 도달)

Samsung 캡처: 볼륨다운 + 전원 동시. 저장 위치: `/sdcard/DCIM/Screenshots/`.
