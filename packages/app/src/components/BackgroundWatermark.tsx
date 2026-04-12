import React from 'react';
import { StyleSheet, ImageBackground, View } from 'react-native';
import { isMobile } from '../utils/responsive';

interface Props {
  ingame?: boolean;
}

export function BackgroundWatermark({ ingame = false }: Props) {
  return (
    <View style={S.container} pointerEvents="none">
      <ImageBackground
        source={require('../../assets/splash.png')}
        style={S.bg}
        imageStyle={S.image}
        resizeMode="contain"
      >
        <View style={[S.overlay, ingame && S.overlayIngame]} />
      </ImageBackground>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  bg: {
    width: '100%',
    height: '100%',
    ...(isMobile ? { transform: [{ scaleX: 1.3 }, { scaleY: 2.5 }] } : {}),
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: isMobile ? 'contain' : 'cover',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26,71,42,0.82)',
  },
  overlayIngame: {
    backgroundColor: 'rgba(26,71,42,0.88)',
  },
});
