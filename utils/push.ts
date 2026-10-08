/**
 * ============================================================
 * PUSH NOTIFICATIONS - TEMPORARILY DISABLED
 * ============================================================
 *
 * Notifications are disabled while developing with Expo Go.
 *
 * expo-notifications has been removed from the project for now,
 * so this file intentionally contains no expo-notifications import.
 *
 * When notifications are enabled again, this file can be restored
 * to the real push implementation.
 */

export interface PushTarget {
  notificationId?: string | null;
  category?: string | null;
  entityId?: string | null;
}

export interface InAppBanner {
  id: string;
  title: string;
  body: string;
  target: PushTarget;
}

export interface PushStatus {
  step:
    | "idle"
    | "not-a-device"
    | "permission-denied"
    | "no-project-id"
    | "token-failed"
    | "waiting-for-login"
    | "server-rejected"
    | "turned-off"
    | "registered";

  token?: string | null;
  detail?: string;
}

export type EnablePushResult =
  | {
      ok: true;
      token: string;
    }
  | {
      ok: false;
      reason:
        | "not-a-device"
        | "denied"
        | "blocked"
        | "failed";
    };

type BannerHandler = (banner: InAppBanner) => void;

const bannerHandlers = new Set<BannerHandler>();

let _status: PushStatus = {
  step: "not-a-device",
};

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export function getPushStatus(): PushStatus {
  return _status;
}

/**
 * ============================================================
 * IN-APP BANNER
 * ============================================================
 *
 * Kept so existing dashboard/shell code does not break.
 */

export function onInAppBanner(handler: BannerHandler) {
  bannerHandlers.add(handler);

  return () => {
    bannerHandlers.delete(handler);
  };
}

function publishBanner(banner: InAppBanner) {
  bannerHandlers.forEach((handler) => {
    try {
      handler(banner);
    } catch (error) {
      console.error("In-app banner handler error:", error);
    }
  });
}

/**
 * Allows the app to show an internal banner.
 *
 * This does NOT use expo-notifications.
 */
export function showInAppBanner(
  title: string,
  body: string
) {
  publishBanner({
    id: `local-${Date.now()}`,
    title,
    body,
    target: {},
  });
}

/**
 * ============================================================
 * PUSH PREFERENCE
 * ============================================================
 *
 * Push is currently unavailable because expo-notifications
 * is removed while using Expo Go.
 */

export async function isPushEnabled(): Promise<boolean> {
  return false;
}

/**
 * ============================================================
 * ENABLE PUSH
 * ============================================================
 */

export async function enablePush(): Promise<EnablePushResult> {
  _status = {
    step: "not-a-device",
    detail: "Push notifications are disabled in Expo Go.",
  };

  return {
    ok: false,
    reason: "not-a-device",
  };
}

/**
 * ============================================================
 * DISABLE PUSH
 * ============================================================
 */

export async function disablePush(): Promise<void> {
  _status = {
    step: "turned-off",
  };
}

/**
 * ============================================================
 * REGISTER PUSH
 * ============================================================
 *
 * Kept for compatibility with useNotifications().
 */

export async function registerForPush(): Promise<string | null> {
  _status = {
    step: "not-a-device",
    detail: "Push notifications are disabled in Expo Go.",
  };

  return null;
}

/**
 * ============================================================
 * UNREGISTER PUSH
 * ============================================================
 */

export async function unregisterPush(): Promise<void> {
  _status = {
    step: "idle",
  };
}

/**
 * ============================================================
 * OPENED FROM PUSH
 * ============================================================
 */

export async function openedFromPush(): Promise<PushTarget | null> {
  return null;
}

/**
 * ============================================================
 * PUSH TAP LISTENER
 * ============================================================
 *
 * No-op while push notifications are disabled.
 */

export function onPushTapped(
  _handler: (target: PushTarget) => void
) {
  return () => {};
}

/**
 * ============================================================
 * PUSH RECEIVED LISTENER
 * ============================================================
 *
 * No-op while push notifications are disabled.
 */

export function onPushReceived(
  _handler: (target: PushTarget) => void
) {
  return () => {};
}

/**
 * ============================================================
 * BADGE
 * ============================================================
 */

export async function clearBadge(): Promise<void> {
  // Nothing to clear while push notifications are disabled.
}