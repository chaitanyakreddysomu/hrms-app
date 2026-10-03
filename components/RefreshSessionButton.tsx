import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { refreshAccessToken } from "../utils/authStorage";

/**
 * ============================================================
 * REFRESH SESSION
 * ============================================================
 *
 * Shown under a session error. Trades the stored refresh token
 * for a new access token and calls `onDone` so the screen can
 * retry whatever failed, without anybody signing in again.
 *
 * Only worth offering while a refresh token exists. When the
 * server turns that down too, the session really is over and the
 * button says so instead of pretending it can help.
 */
interface Props {
  /** run after a successful refresh, usually the screen's load */
  onDone: () => void;
  label?: string;
}

export default function RefreshSessionButton({
  onDone,
  label = "Refresh session",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;

    setBusy(true);
    setFailed(null);

    const result = await refreshAccessToken();

    setBusy(false);

    if (result.ok) {
      onDone();
      return;
    }

    setFailed(
      result.reason === "offline"
        ? "Could not reach the server. Check your connection."
        : "Your session has fully expired. Please sign in again."
    );
  };

  return (
    <View style={{ alignItems: "center", marginTop: 16 }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={run}
        disabled={busy}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          paddingHorizontal: 20,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#2563EB",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name="refresh" size={16} color="#FFFFFF" />
        )}
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>
          {busy ? "Refreshing" : label}
        </Text>
      </TouchableOpacity>

      {!!failed && (
        <Text
          style={{
            color: "#DC2626",
            fontSize: 12,
            fontWeight: "600",
            textAlign: "center",
            marginTop: 10,
            paddingHorizontal: 20,
          }}
        >
          {failed}
        </Text>
      )}
    </View>
  );
}
