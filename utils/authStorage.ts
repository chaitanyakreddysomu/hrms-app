import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AuthSession {
  token?: string;
  refreshToken?: string;
  /** false means do not restore this session on the next launch */
  remember?: boolean;
  user: {
    id?: string;
    name: string;
    role: string;
    email?: string;
  };
}

const AUTH_KEY = "@hrms_auth_session";

export const saveAuthSession = async (session: AuthSession) => {
  try {
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(session));
  } catch (error) {
    console.error("Error saving auth session:", error);
  }
};

export const getAuthSession = async (): Promise<AuthSession | null> => {
  try {
    const data = await AsyncStorage.getItem(AUTH_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error reading auth session:", error);
    return null;
  }
};

export const clearAuthSession = async () => {
  try {
    await AsyncStorage.removeItem(AUTH_KEY);
  } catch (error) {
    console.error("Error clearing auth session:", error);
  }

  /**
   * The running clock belongs to whoever just signed out. Nothing
   * reloads an attendance record on the login screen, so without
   * this it would keep counting over the top of it and greet the
   * next person with the last one's shift.
   */
  const { setOpenShift } = require("./shiftClock");
  setOpenShift(null);
};

/**
 * ============================================================
 * REFRESH THE ACCESS TOKEN
 * ============================================================
 *
 * The access token lasts an hour, the refresh token far longer.
 * POST /api/auth/refresh trades the second for a new first, which
 * is written back into the stored session so every later request
 * picks it up. The web app does the same thing from its top bar.
 *
 * Returns why it failed rather than a bare false, since "there is
 * no refresh token" and "the server rejected it" both mean signing
 * in again but read very differently to whoever is waiting.
 */
/**
 * Whether a failure is the session rather than the request, and so
 * whether offering a refresh could actually help.
 */
export const isAuthError = (message?: string | null): boolean => {
  if (!message) return false;

  return /not authenticated|session expired|unauthor|forbidden|401|403|token/i.test(
    message
  );
};

export type RefreshResult =
  | { ok: true }
  | { ok: false; reason: "no-session" | "rejected" | "offline" };

export const refreshAccessToken = async (): Promise<RefreshResult> => {
  const session = await getAuthSession();

  if (!session?.refreshToken) return { ok: false, reason: "no-session" };

  try {
    /** imported here so this module stays free of a cycle with api.ts */
    const { API_BASE_URL } = require("./api");

    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    if (!res.ok) return { ok: false, reason: "rejected" };

    const data = await res.json().catch(() => null);
    const accessToken = data?.accessToken || data?.token;

    if (!accessToken) return { ok: false, reason: "rejected" };

    await saveAuthSession({ ...session, token: accessToken });

    return { ok: true };
  } catch (error) {
    console.error("Token refresh failed:", error);
    return { ok: false, reason: "offline" };
  }
};
