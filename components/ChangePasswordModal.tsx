import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getAuthSession,
  saveAuthSession,
} from "../utils/authStorage";
import { apiFetch } from "../utils/api";

/**
 * ============================================================
 * CHANGE PASSWORD (FORCED)
 * ============================================================
 *
 * Mounted once in AppShell, so it sits over every dashboard. Shown
 * instead of letting the app through when the signed-in account is
 * still on its default password (set by an admin who just added
 * the employee). There is no way out: no close button, and the
 * Android back button is swallowed rather than dismissing it.
 */
export default function ChangePasswordModal() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAuthSession().then((session) => {
      setVisible(!!session?.user?.mustChangePassword);
    });
  }, []);

  const submit = async () => {
    setError("");

    if (newPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        "/api/auth/change-password",
        session.token,
        {
          method: "POST",
          body: JSON.stringify({
            currentPassword: "1234",
            newPassword,
          }),
        }
      );

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setError(data?.message || "Could not update your password.");
        return;
      }

      await saveAuthSession({
        ...session,
        user: { ...session.user, mustChangePassword: false },
      });

      setNewPassword("");
      setConfirmPassword("");
      setVisible(false);
    } catch (err) {
      console.error("Change password error:", err);
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      /** swallow the Android back button rather than let it close this */
      onRequestClose={() => {}}
    >
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 28,
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
            }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: "#EFF6FF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Ionicons name="key-outline" size={28} color="#2563EB" />
              </View>

              <Text
                style={{
                  fontSize: 21,
                  fontWeight: "800",
                  color: "#0F172A",
                  textAlign: "center",
                }}
              >
                Set a New Password
              </Text>

              <Text
                style={{
                  fontSize: 13,
                  color: "#64748B",
                  textAlign: "center",
                  marginTop: 8,
                  lineHeight: 19,
                }}
              >
                Your account is still using the default password. Choose a
                new one to continue.
              </Text>
            </View>

            <Text
              style={{
                color: "#374151",
                fontSize: 12,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              New Password
            </Text>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                height: 50,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                marginBottom: 16,
              }}
            >
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoFocus
                style={{ flex: 1, color: "#111827", fontSize: 15 }}
              />

              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={19}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>

            <Text
              style={{
                color: "#374151",
                fontSize: 12,
                fontWeight: "700",
                marginBottom: 6,
              }}
            >
              Confirm Password
            </Text>

            <View
              style={{
                height: 50,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                backgroundColor: "#FFFFFF",
                paddingHorizontal: 14,
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={{ color: "#111827", fontSize: 15 }}
              />
            </View>

            {!!error && (
              <Text
                style={{
                  color: "#DC2626",
                  fontSize: 13,
                  fontWeight: "600",
                  marginTop: 6,
                }}
              >
                {error}
              </Text>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={submit}
              disabled={saving}
              style={{
                height: 52,
                borderRadius: 16,
                backgroundColor: saving ? "#93B4F7" : "#2563EB",
                alignItems: "center",
                justifyContent: "center",
                marginTop: 18,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "700" }}
                >
                  Update Password
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
