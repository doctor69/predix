'use client';

import { createContext, useContext, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface AuthState {
  authenticated: boolean;
  ready: boolean;
  login: () => void;
  logout: () => void;
}

const STUBS: AuthState = {
  authenticated: false,
  ready: true,
  login: () => {},
  logout: () => {},
};

export const AuthContext = createContext<AuthState>(STUBS);

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Inner bridge that reads from Privy and puts values into AuthContext. */
export function PrivyAuthBridge({ children }: { children: ReactNode }) {
  const { authenticated, ready, login, logout } = usePrivy();
  return (
    <AuthContext.Provider
      value={{
        authenticated,
        ready,
        login,
        logout: () => void logout(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
