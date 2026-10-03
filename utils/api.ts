/**
 * Centralized API utility for the HRMS Mobile App.
 *
 * The backend is deployed, so there is one address and it is the
 * same from every device: a phone on mobile data, a phone on any
 * Wi-Fi, an emulator, a simulator. Nothing is probed and nothing
 * depends on which network the laptop happens to be on.
 */

/** The one place the backend address lives. */
const DEPLOYED = "https://hrms-zeta-livid.vercel.app";

/**
 * Point this at a machine on the LAN to work against a backend
 * running locally, e.g. "http://192.168.1.34:5000". Left empty the
 * app uses the deployed one above.
 */
const LOCAL_OVERRIDE = "";

/** What every request goes to, override included. */
export const API_BASE_URL = LOCAL_OVERRIDE || DEPLOYED;

const BASE = API_BASE_URL;

/**
 * Kept for the screens that name the host in an error message.
 * There is no port and no IP any more, so this is the hostname.
 */
export const LOCAL_IP = BASE.replace(/^https?:\/\//, "");

/**
 * The base never changes now, so there is nothing to resolve. The
 * function stays because callers ask for it after a failed request,
 * where it is simply a no-op.
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
