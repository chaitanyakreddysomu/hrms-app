import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

import { getAuthSession } from "./authStorage";

/**
 * ============================================================
 * BIOMETRIC LOGIN
 * ============================================================
 *
 * Biometrics never replace the password. They only guard the
 * saved session:
 *
 *   Logout        -> the session is cleared, so the next login
 *                    is always email + password (+ 2FA).
 *   Reopening the -> the saved session is only restored after a
 *   app             successful fingerprint or face check. A
 *                   failed check falls back to a full login.
 */
const BIOMETRIC_KEY = "@hrms_biometric_enabled";

export interface BiometricSupport {
  /** the device has the sensor */
  available: boolean;
  /** the user has actually enrolled a fingerprint or a face */
  enrolled: boolean;
  /** "Face ID", "Fingerprint", or a generic fallback */
  label: string;
}

/**
 * What this device can offer. Both flags have to be true before
 * the option is worth showing.
 */
export async function getBiometricSupport(): Promise<BiometricSupport> {
  try {
    const available = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const types =
      await LocalAuthentication.supportedAuthenticationTypesAsync();

    let label = "Biometric login";

    if (
      types.includes(
        LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
      )
    ) {
      label = "Face unlock";
    } else if (
      types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    ) {
      label = "Fingerprint unlock";
    }

    return { available, enrolled, label };
  } catch (error) {
    console.error("Biometric support check failed:", error);
    return { available: false, enrolled: false, label: "Biometric login" };
  }
}

/**
 * The preference belongs to one account, not to the device. It is
 * stored with the account it was switched on for, so a different
 * person signing in on the same phone starts with it off rather
 * than inheriting the last user's setting.
 */
interface StoredPreference {
  enabled: boolean;
  account: string;
}

/** whoever is signed in right now, or empty before a login */
async function currentAccount(): Promise<string> {
  try {
    const session = await getAuthSession();

    return (
      session?.user?.id ||
      session?.user?.email ||
      ""
    ).toLowerCase();
  } catch {
    return "";
  }
}

async function readPreference(): Promise<StoredPreference | null> {
  try {
    const raw = await AsyncStorage.getItem(BIOMETRIC_KEY);
    if (!raw) return null;

    /** anything written by an older build belongs to nobody */
    if (raw === "true" || raw === "false") return null;

    const parsed = JSON.parse(raw);

    return typeof parsed?.enabled === "boolean" ? parsed : null;
  } catch (error) {
    console.error("Error reading biometric preference:", error);
    return null;
  }
}

/** Has this account switched it on in their profile? */
export async function isBiometricEnabled(): Promise<boolean> {
  const stored = await readPreference();
  if (!stored?.enabled) return false;

  const account = await currentAccount();

  /** on for someone else means off for the person here now */
  return !!account && stored.account === account;
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    const account = await currentAccount();

    const value: StoredPreference = { enabled, account };

    await AsyncStorage.setItem(BIOMETRIC_KEY, JSON.stringify(value));
  } catch (error) {
    console.error("Error saving biometric preference:", error);
  }
}

/** Forgets the setting entirely, used when an account is removed. */
export async function clearBiometricPreference(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BIOMETRIC_KEY);
  } catch (error) {
    console.error("Error clearing biometric preference:", error);
  }
}

/**
 * Run the prompt. The device passcode is allowed as the fallback,
 * so a wet finger does not lock anyone out of their own phone.
 */
export async function verifyBiometric(
  reason = "Unlock your HRMS session"
): Promise<boolean> {
  try {
    const { available, enrolled } = await getBiometricSupport();
    if (!available || !enrolled) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Use password",
      disableDeviceFallback: false,
    });

    return result.success;
  } catch (error) {
    console.error("Biometric prompt failed:", error);
    return false;
  }
}
