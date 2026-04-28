// EAS Build 시 Firebase 설정 파일을 EAS file env var 로 주입.
// .gitignore 로 Firebase 키 파일을 추적 해제했으므로 (14차 보안 작업),
// EAS 클라우드 빌드는 GOOGLE_SERVICES_JSON / GOOGLE_SERVICE_INFO_PLIST
// 시크릿 환경변수에서 파일 경로를 받아 사용한다.
//
// 로컬 dev / preview 빌드는 env var 가 없으므로 app.json 의 정적 경로
// (./google-services.json / ./GoogleService-Info.plist) 로 폴백한다.

const baseConfig = require('./app.json').expo;

module.exports = () => ({
  ...baseConfig,
  android: {
    ...baseConfig.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? baseConfig.android.googleServicesFile,
  },
  ios: {
    ...baseConfig.ios,
    googleServicesFile:
      process.env.GOOGLE_SERVICE_INFO_PLIST ?? baseConfig.ios.googleServicesFile,
  },
});
