import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // 인티그레이션 테스트 (real socket.io server + DB layer) 가 섞여 있어
    // vitest 기본 5s 는 콜드 스타트 시 빠듯하다. 15s 로 올려 flakiness 완화.
    testTimeout: 15000,
  },
});
