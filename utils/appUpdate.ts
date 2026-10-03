import Constants from "expo-constants";
import { Linking } from "react-native";

/**
 * ============================================================
 * APP UPDATE
 * ============================================================
 *
 * There is no app store here, so "check for update" means asking
 * GitHub directly: the latest release's tag is the latest version,
 * and its APK asset is what gets installed. The CI workflow tags
 * every release v<package.json version>, so the tag is the source
 * of truth on both ends.
 */
const REPO = "chaitanyakreddysomu/hrms-app";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
  releaseUrl: string | null;
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
 * Asks GitHub for the latest release and compares it to the
 * running version. A failed check (offline, rate limited, no
 * release yet) reports no update rather than throwing, since a
 * missed check should not read as "you are up to date".
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();

  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!res.ok) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        downloadUrl: null,
        releaseNotes: null,
        releaseUrl: null,
        error: `GitHub returned ${res.status}`,
      };
    }

    const data = await res.json();
    const latestVersion = String(data?.tag_name || "").replace(/^v/i, "");

    const asset = (data?.assets || []).find((a: any) =>
      String(a?.name || "").toLowerCase().endsWith(".apk")
    );

    return {
      currentVersion,
      latestVersion: latestVersion || null,
      updateAvailable: latestVersion
        ? isNewer(latestVersion, currentVersion)
        : false,
      downloadUrl: asset?.browser_download_url || null,
      releaseNotes: data?.body || null,
      releaseUrl: data?.html_url || null,
    };
  } catch (error: any) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      downloadUrl: null,
      releaseNotes: null,
      releaseUrl: null,
      error: error?.message || String(error),
    };
  }
}

/**
 * Hands the APK off to the system rather than installing it
 * silently: that needs REQUEST_INSTALL_PACKAGES plus a FileProvider
 * just to reach the same confirmation dialog Android already shows
 * for a browser download, so there is nothing to gain by building it.
 */
export async function openDownload(url: string): Promise<void> {
  await Linking.openURL(url);
}
