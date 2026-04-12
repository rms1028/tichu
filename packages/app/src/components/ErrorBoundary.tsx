import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * 앱 최상위 에러 바운더리.
 * 렌더링/라이프사이클 중 발생한 에러를 캐치해서 흰 화면 대신
 * 화면에 에러 메시지와 스택을 직접 출력한다.
 *
 * 네이티브 빌드(production)에서 디버깅 오버레이가 없을 때
 * 원인 파악이 어려운 상황을 막기 위함.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 개발 콘솔에도 출력 (Expo Go / Metro 로그에서 확인 가능)
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught error:', error);
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.error) {
      const { error, errorInfo } = this.state;
      const stack = error.stack || '(no stack)';
      const componentStack = errorInfo?.componentStack || '(no component stack)';
      return (
        <View style={S.root}>
          <ScrollView contentContainerStyle={S.content}>
            <Text style={S.title}>⚠️ 앱 초기화 실패</Text>
            <Text style={S.platform}>Platform: {Platform.OS} {Platform.Version}</Text>

            <Text style={S.sectionTitle}>Error</Text>
            <Text style={S.errorName}>{error.name}: {error.message}</Text>

            <Text style={S.sectionTitle}>Stack</Text>
            <Text style={S.code}>{stack}</Text>

            <Text style={S.sectionTitle}>Component Stack</Text>
            <Text style={S.code}>{componentStack}</Text>

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
  footer: {
    color: '#666',
    fontSize: 12,
    marginTop: 20,
    textAlign: 'center',
  },
});
