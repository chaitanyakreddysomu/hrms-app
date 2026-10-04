import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

/**
 * ============================================================
 * APP UPDATE
 * ============================================================
 *
 * There is no app store here, so "check for update" means asking
 * a plain JSON file for the current state of the world: the
 * latest version, where its APK lives, and what changed. Easier
 * to author and faster to read than GitHub's release API, and it
 * can list features separately from the one-line changelog.
 *
 * The file lives at the repo root and is updated by hand (or by
 * CI) alongside each release; raw.githubusercontent.com serves
 * whatever is on `main` right now.
 */
const VERSION_JSON_URL =
  "https://raw.githubusercontent.com/chaitanyakreddysomu/hrms-app/main/version.json";

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  changelog: string | null;
  features: string[];
  error?: string;
}

/** "1.2.10" -> [1, 2, 10], short of a part reads as 0 */
function parseVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;

    if (x > y) return true;
    if (x < y) return false;
  }

  return false;
}

/** The version this JS bundle was built with, from app.json. */
export function getCurrentVersion(): string {
  return Constants.expoConfig?.version || "0.0.0";
}

/**
 * Reads version.json and compares it to the running version. A
 * failed check (offline, rate limited, malformed file) reports no
 * update rather than throwing, since a missed check should not
 * read as "you are up to date".
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();
  const empty = {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    downloadUrl: null,
    changelog: null,
    features: [] as string[],
  };

  try {
    /** the query string busts the CDN cache in front of raw.githubusercontent.com */
    const res = await fetch(`${VERSION_JSON_URL}?t=${Date.now()}`);

    if (!res.ok) {
      return { ...empty, error: `Could not reach the update server (${res.status})` };
    }

    const data = await res.json();
    const latestVersion = String(data?.latestVersion || "").trim();

    return {
      ...empty,
      latestVersion: latestVersion || null,
      updateAvailable: latestVersion ? isNewer(latestVersion, currentVersion) : false,
      downloadUrl: data?.downloadUrl || null,
      changelog: data?.changelog || null,
      features: Array.isArray(data?.features) ? data.features : [],
    };
  } catch (error: any) {
    return { ...empty, error: error?.message || String(error) };
  }
}

export interface DownloadProgressInfo {
  /** 0 to 1 */
  progress: number;
}

/**
 * Downloads the APK into the app's own cache, in-app, with
 * progress - instead of handing the URL to the browser and losing
 * all visibility into it.
 */
export async function downloadApk(
  url: string,
  onProgress?: (info: DownloadProgressInfo) => void
): Promise<string> {
  if (!FileSystem.cacheDirectory) {
    throw new Error("No cache directory available on this device.");
  }

  const destination = `${FileSystem.cacheDirectory}update.apk`;

  /** a stale partial file from an earlier attempt should not be mistaken for a fresh one */
  const existing = await FileSystem.getInfoAsync(destination);
  if (existing.exists) {
    await FileSystem.deleteAsync(destination, { idempotent: true });
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    destination,
    {},
    (progressEvent) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = progressEvent;
      if (totalBytesExpectedToWrite > 0) {
        onProgress?.({ progress: totalBytesWritten / totalBytesExpectedToWrite });
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error("Download did not complete");

  return result.uri;
}

/**
 * Hands the downloaded APK to Android's own package installer.
 * REQUEST_INSTALL_PACKAGES (declared in app.json) is what lets this
 * happen without first bouncing through a browser download - the
 * user still sees Android's own "install unknown apps" prompt and
 * the installer's own confirmation screen, same as it would from a
 * browser download, just without the extra hop to get there.
 */
export async function installApk(localFileUri: string): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error("In-app install is only supported on Android.");
  }

  const contentUri = await FileSystem.getContentUriAsync(localFileUri);

  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
    type: "application/vnd.android.package-archive",
  });
}

/** Fallback for platforms that can't sideload, e.g. iOS. */
export async function openDownload(url: string): Promise<void> {
  await Linking.openURL(url);
}
