import { PermissionStatus, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect } from 'react';

type Options = {
  autoRequest?: boolean;
};

export const useCameraPermissionRequest = (options: Options = {}) => {
  const [permissionResponse, requestPermissionNative] = useCameraPermissions();
  const { autoRequest = false } = options;

  const requestPermission = useCallback(async () => {
    if (permissionResponse?.status === PermissionStatus.GRANTED) {
      return true;
    }

    const response = await requestPermissionNative();

    return response?.granted ?? false;
  }, [permissionResponse?.status, requestPermissionNative]);

  useEffect(() => {
    if (!autoRequest) {
      return;
    }

    if (permissionResponse?.status === PermissionStatus.GRANTED) {
      return;
    }

    if (permissionResponse?.status === PermissionStatus.DENIED && permissionResponse.canAskAgain === false) {
      return;
    }

    requestPermission();
  }, [autoRequest, permissionResponse?.canAskAgain, permissionResponse?.status, requestPermission]);

  return {
    permissionResponse,
    requestPermission: requestPermission,
  };
};
