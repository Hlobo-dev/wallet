import EventEmitter from 'eventemitter3';
import { useLayoutEffect } from 'react';

const homeAssetPanelEmitter = new EventEmitter();
enum HomeAssetPanelEmitter {
  showRecentActivity = 'showRecentActivity',
}

export const showRecentActivity = () => {
  homeAssetPanelEmitter.emit(HomeAssetPanelEmitter.showRecentActivity);
};

export const useHomeAssetPanelEmitterListener = (callback: () => void) => {
  useLayoutEffect(() => {
    homeAssetPanelEmitter.on(HomeAssetPanelEmitter.showRecentActivity, callback);
    return () => {
      homeAssetPanelEmitter.off(HomeAssetPanelEmitter.showRecentActivity, callback);
    };
  }, [callback]);
};
