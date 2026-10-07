import Constants from "expo-constants";

/** Centralized API utility for the HRMS Mobile App. */

/** The one place the backend address lives. */
const DEPLOYED = "https://hrms-zeta-livid.vercel.app";

/**
 * In development, use the host running Expo and the local backend.
 * With `npx expo start` on LAN, hostUri supplies the computer's LAN IP
 * so a physical phone can reach the backend too.
 */
const expoHost = Constants.expoConfig?.hostUri;
const localHost = expoHost
  ? expoHost.startsWith("[")
    ? expoHost.slice(0, expoHost.indexOf("]") + 1)
    : expoHost.replace(/:\d+$/, "")
  : "localhost";
const DEVELOPMENT = `http://${localHost}:5000`;

/** Development uses the local API; release builds use production. */
export const API_BASE_URL = __DEV__ ? DEVELOPMENT : DEPLOYED;

const BASE = API_BASE_URL;

/**
 * Kept for screens that include the API host in error messages.
 */
export const LOCAL_IP = BASE.replace(/^https?:\/\//, "");

/**
 * Kept for existing callers; the base URL is selected at startup.
 */
export function resetBaseUrl() {}

/**
 * Authenticated fetch wrapper.
 * @param path   e.g. "/api/admin/pending-requests"
 * @param token  JWT bearer token
 * @param init   Additional fetch options (method, body, etc.)
 */
export async function apiFetch(
  path: string,
  token: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${BASE}${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  return fetch(url, { ...init, headers });
}
