"use client";

import { createContext, useContext } from "react";
import type { AuthenticatedUser } from "@clinic/shared";

const AuthContext = createContext<AuthenticatedUser | null>(null);

export function AuthProvider({ user, children }: { user: AuthenticatedUser; children: React.ReactNode }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const user = useContext(AuthContext);
  if (!user) {
    throw new Error("Authenticated user is not available");
  }
  return user;
}
