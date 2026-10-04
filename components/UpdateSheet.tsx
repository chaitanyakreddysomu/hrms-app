import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  checkForUpdate,
  downloadApk,
  getCurrentVersion,
  installApk,
  openDownload,
  UpdateCheckResult,
} from "../utils/appUpdate";

/**
 * ============================================================
 * UPDATE SHEET
 * ============================================================
 *
 * The row below Notifications opens this rather than checking on
 * its own: a version check is a network call, and nobody asked for
 * one just by opening their profile. It starts blank and only
 * checks once "Check for Updates" is pressed.
 *
 * On Android the APK downloads inside the app (with progress)
 * instead of handing the URL to the browser, then the system
 * installer opens directly off the downloaded file. iOS has no
 * sideloading, so it falls back to opening the URL.
 */
interface Props {
  visible: boolean;
  onClose: () => void;
}

type Stage =
  | "idle"
  | "checking"
  | "done"
  | "error"
  | "downloading"
  | "downloaded"
  | "installing";

export default function UpdateSheet({ visible, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);

  const runCheck = async () => {
    setStage("checking");

    const outcome = await checkForUpdate();
    setResult(outcome);
    setStage(outcome.error ? "error" : "done");
  };

  const startDownload = async () => {
    if (!result?.downloadUrl) return;

    /** no sideloading on iOS - the browser is the only way to get the file there */
    if (Platform.OS !== "android") {
      openDownload(result.downloadUrl);
      return;
    }

    setStage("downloading");
    setProgress(0);

    try {
      const uri = await downloadApk(result.downloadUrl, (info) =>
        setProgress(info.progress)
      );
      setLocalUri(uri);
      setStage("downloaded");
    } catch (error) {
      console.error("APK download failed:", error);
      setResult((r) => (r ? { ...r, error: "The download failed. Try again." } : r));
      setStage("error");
    }
  };

  const install = async () => {
    if (!localUri) return;

    setStage("installing");

    try {
      await installApk(localUri);
      /** Android's own installer takes over from here on its own screen */
      close();
    } catch (error) {
      console.error("APK install failed:", error);
      setResult((r) => (r ? { ...r, error: "Could not open the installer." } : r));
      setStage("error");
    }
  };

  const close = () => {
    onClose();
    /** a stale result should not greet the next open */
    setStage("idle");
    setResult(null);
    setProgress(0);
    setLocalUri(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />

          <View style={styles.iconWrap}>
            <Ionicons name="cloud-download-outline" size={26} color="#2563EB" />
          </View>

          <Text style={styles.title}>App Update</Text>
          <Text style={styles.version}>
            Current version: {getCurrentVersion()}
          </Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {stage === "idle" && (
              <Text style={styles.message}>
                Check for the latest version of this app.
              </Text>
            )}

            {stage === "checking" && (
              <View style={styles.statusRow}>
                <ActivityIndicator color="#2563EB" />
                <Text style={styles.message}>Checking for updates…</Text>
              </View>
            )}

            {stage === "error" && (
              <View style={[styles.statusRow, styles.errorRow]}>
                <Ionicons name="warning-outline" size={18} color="#DC2626" />
                <Text style={[styles.message, styles.errorText]}>
                  {result?.error || "Something went wrong."}
                </Text>
              </View>
            )}

            {stage === "done" && result && !result.updateAvailable && (
              <View style={[styles.statusRow, styles.okRow]}>
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color="#059669"
                />
                <Text style={[styles.message, styles.okText]}>
                  You're on the latest version.
                </Text>
              </View>
            )}

            {result?.updateAvailable &&
              (stage === "done" ||
                stage === "downloading" ||
                stage === "downloaded" ||
                stage === "installing") && (
                <View style={styles.updateBlock}>
                  <View style={[styles.statusRow, styles.updateRow]}>
                    <Ionicons name="sparkles" size={18} color="#D97706" />
                    <Text style={[styles.message, styles.updateText]}>
                      Version {result.latestVersion} is available.
                    </Text>
                  </View>

                  {!!result.changelog && (
                    <Text style={styles.notes}>{result.changelog}</Text>
                  )}

                  {result.features.length > 0 && (
                    <View style={styles.featureList}>
                      <Text style={styles.featureHeading}>What's new</Text>

                      {result.features.map((feature, index) => (
                        <View key={index} style={styles.featureRow}>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={15}
                            color="#2563EB"
                          />
                          <Text style={styles.featureText}>{feature}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {stage === "downloading" && (
                    <View style={styles.progressWrap}>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.round(progress * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>
                        Downloading… {Math.round(progress * 100)}%
                      </Text>
                    </View>
                  )}

                  {stage === "downloaded" && (
                    <View style={[styles.statusRow, styles.okRow]}>
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color="#059669"
                      />
                      <Text style={[styles.message, styles.okText]}>
                        Downloaded. Ready to install.
                      </Text>
                    </View>
                  )}

                  {stage === "installing" && (
                    <View style={styles.statusRow}>
                      <ActivityIndicator color="#2563EB" />
                      <Text style={styles.message}>Opening installer…</Text>
                    </View>
                  )}
                </View>
              )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={close}
              style={[styles.button, styles.cancel]}
            >
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>

            {stage === "downloaded" ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={install}
                style={[styles.button, styles.confirm]}
              >
                <Text style={styles.confirmText}>Install</Text>
              </TouchableOpacity>
            ) : result?.updateAvailable &&
              result.downloadUrl &&
              (stage === "done" || stage === "error") ? (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={startDownload}
                style={[styles.button, styles.confirm]}
              >
                <Text style={styles.confirmText}>
                  {Platform.OS === "android" ? "Download & Install" : "Download"}
                </Text>
              </TouchableOpacity>
            ) : stage === "downloading" || stage === "installing" ? (
              <View style={[styles.button, styles.confirm, styles.buttonBusy]}>
                <ActivityIndicator color="#FFFFFF" size="small" />
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={runCheck}
                disabled={stage === "checking"}
                style={[styles.button, styles.confirm]}
              >
                <Text style={styles.confirmText}>
                  {stage === "checking" ? "Checking…" : "Check for Updates"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 34,
    alignItems: "center",
    maxHeight: "80%",
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    marginBottom: 20,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "#EFF6FF",
  },
  title: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  version: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  body: {
    alignSelf: "stretch",
    marginTop: 18,
  },
  bodyContent: {
    alignItems: "center",
  },
  message: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  okRow: {
    backgroundColor: "#ECFDF5",
  },
  okText: {
    color: "#047857",
    flex: 1,
    textAlign: "left",
  },
  errorRow: {
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    color: "#B91C1C",
    flex: 1,
    textAlign: "left",
  },
  updateRow: {
    backgroundColor: "#FFFBEB",
  },
  updateText: {
    color: "#B45309",
    fontWeight: "700",
    flex: 1,
    textAlign: "left",
  },
  updateBlock: {
    alignSelf: "stretch",
  },
  notes: {
    color: "#64748B",
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  featureList: {
    marginTop: 16,
    paddingHorizontal: 2,
  },
  featureHeading: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 7,
  },
  featureText: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    lineHeight: 19,
  },
  progressWrap: {
    marginTop: 16,
    paddingHorizontal: 2,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#2563EB",
    borderRadius: 4,
  },
  progressText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: 12,
    marginTop: 22,
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonBusy: {
    flexDirection: "row",
    justifyContent: "center",
  },
  cancel: {
    backgroundColor: "#F1F5F9",
  },
  cancelText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  confirm: {
    backgroundColor: "#2563EB",
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
