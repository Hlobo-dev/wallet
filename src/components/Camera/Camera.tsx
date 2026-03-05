import type { FC } from 'react';

import { useNavigation } from '@react-navigation/native';
import { CameraView } from 'expo-camera';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { runAfterUISync } from '@/utils/runAfterUISync';

import type { CameraViewProps } from 'expo-camera';

export const Camera: FC<CameraViewProps> = props => {
  const [cameraVisible, setCameraVisible] = useState(true);

  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', e => {
      e.preventDefault();
      if (cameraVisible) {
        setCameraVisible(false);
        runAfterUISync(() => navigation.dispatch(e.data.action));
      }
    });

    return unsubscribe;
  }, [cameraVisible, navigation]);

  return cameraVisible ? <CameraView {...props} style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} /> : null;
};
