import noop from 'lodash/noop';
import React, { type Dispatch, type PropsWithChildren, type SetStateAction } from 'react';

import { useContext, useState } from 'react';

interface ContextProps {
  isRefreshing: ReturnType<typeof useState<boolean>>;
  isInAppBrowserOpen: ReturnType<typeof useState<boolean>>;
  showNavTabs: [boolean, Dispatch<SetStateAction<boolean>>];
  openAccountSheet: [boolean, Dispatch<SetStateAction<boolean>>];
}

const GlobalContext = React.createContext<ContextProps>({
  isRefreshing: [false, noop],
  isInAppBrowserOpen: [false, noop],
  showNavTabs: [true, noop],
  openAccountSheet: [false, noop],
});

export const GlobalStateProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const isRefreshing = useState<boolean>();
  const isInAppBrowserOpen = useState<boolean>();
  const showNavTabs = useState<boolean>(true);
  const openAccountSheet = useState<boolean>(false);

  return <GlobalContext.Provider value={{ isRefreshing, showNavTabs, isInAppBrowserOpen, openAccountSheet }}>{children}</GlobalContext.Provider>;
};

export const useGlobalState = (key: keyof ContextProps) => {
  return useContext(GlobalContext)[key];
};
