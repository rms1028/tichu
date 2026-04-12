import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { getCapturedErrors, hasCapturedErrors } from '../utils/globalErrorCapture';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  tick: number;
}

/**
 * 앱 최상위 에러 바운더리.
 *
 * 두 가지 종류의 에러를 표시:
 * 1. React 렌더/라이프사이클 에러 (componentDidCatch 가 잡음)
 * 2. 글로벌 에러 (globalErrorCapture 에 모인 것 — 모듈 load, 비동기 등)
 *
 * 글로벌 에러가 있으면 자식 렌더 대신 fallback UI 출력.
 * 자식 렌더 도중 React 에러가 잡히면 그것도 출력.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  private pollHandle: any = null;

  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null, tick: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidMount() {
    // 글로벌 에러는 비동기로 도착할 수 있으니 짧게 폴링.
    // 1초마다 5초 동안만 — 초기 부팅 단계 이후엔 안 돈다.
    let count = 0;
    this.pollHandle = setInterval(() => {
      count++;
      if (hasCapturedErrors()) {
        this.setState((s) => ({ tick: s.tick + 1 }));
      }
      if (count >= 5) {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
      }
    }, 1000);
  }

  componentWillUnmount() {
    if (this.pollHandle) clearInterval(this.pollHandle);
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught error:', error);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  render() {
    const captured = getCapturedErrors();
    const hasGlobal = captured.length > 0;

    if (this.state.error || hasGlobal) {
      const reactErr = this.state.error;
      const componentStack = this.state.errorInfo?.componentStack || '(no component stack)';
      return (
        <View style={S.root}>
          <ScrollView contentContainerStyle={S.content}>
            <Text style={S.title}>{'⚠️ 앱 초기화 실패'}</Text>
            <Text style={S.platform}>{`Platform: ${Platform.OS} ${Platform.Version}`}</Text>

            {reactErr && (
              <>
                <Text style={S.sectionTitle}>{'React Error'}</Text>
                <Text style={S.errorName}>{`${reactErr.name}: ${reactErr.message}`}</Text>
                <Text style={S.code}>{reactErr.stack || '(no stack)'}</Text>
                <Text style={S.sectionTitle}>{'Component Stack'}</Text>
                <Text style={S.code}>{componentStack}</Text>
              </>
            )}

            {hasGlobal && (
              <>
                <Text style={S.sectionTitle}>{`Global Errors (${captured.length})`}</Text>
                {captured.map((c, i) => (
                  <View key={i} style={S.captured}>
                    <Text style={S.errorName}>{c.message}</Text>
                    <Text style={S.code}>{c.stack}</Text>
                  </View>
                ))}
              </>
            )}

            <Text style={S.footer}>{'이 전체 내용을 개발자에게 스크린샷으로 전달해 주세요.'}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingTop: 40,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
  },
  title: {
    color: '#ff5555',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  platform: {
    color: '#888',
    fontSize: 12,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 6,
  },
  errorName: {
    color: '#ffaaaa',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  code: {
    color: '#ccc',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    lineHeight: 16,
  },
  captured: {
    marginBottom: 14,
    padding: 10,
    backgroundColor: 'rgba(255,85,85,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#ff5555',
  },
  footer: {
    color: '#666',
    fontSize: 12,
    marginTop: 20,
    textAlign: 'center',
  },
});
