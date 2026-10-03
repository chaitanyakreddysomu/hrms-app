import React, { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

import { saveAuthSession } from "../utils/authStorage";
import { API_BASE_URL } from "../utils/api";

type Props = NativeStackScreenProps<RootStackParamList, "TwoFactor">;

const TWO_FACTOR_ENDPOINT = `${API_BASE_URL}/api/auth/login/2fa`;

/**
 * ============================================================
 * TWO FACTOR VERIFICATION
 * ============================================================
 *
 * Reached only when the password login answered with
 * twoFactorRequired. The short lived tempToken arrives as a
 * route param and is exchanged here, together with the six
 * digit authenticator code, for the real session.
 */
export default function TwoFactorScreen({ navigation, route }: Props) {
  const { tempToken, email, remember } = route.params;

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [otpStatus, setOtpStatus] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const digitRefs = useRef<(TextInput | null)[]>([]);

  /** entrance animation, matching the login card */
  const enterOpacity = useRef(new Animated.Value(0)).current;
  const enterShift = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(enterShift, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const focus = setTimeout(() => digitRefs.current[0]?.focus(), 220);
    return () => clearTimeout(focus);
  }, []);

  /**
   * ============================================================
   * NAVIGATION BY ROLE
   * ============================================================
   */
  const navigateByRole = (roleStr: string, userName: string) => {
    const normalized = String(roleStr || "EMPLOYEE").toUpperCase();

    if (normalized === "ADMIN") {
      navigation.replace("AdminDashboard", { role: "ADMIN", name: userName });
    } else if (normalized === "HR") {
      navigation.replace("HrDashboard", { role: "HR", name: userName });
    } else {
      navigation.replace("UserDashboard", {
        role: "EMPLOYEE",
        name: userName,
      });
    }
  };

  /**
   * ============================================================
   * SIX SEPARATE BOXES
   * ============================================================
   */
  const setDigitAt = (index: number, value: string) => {
    const typed = value.replace(/\D/g, "");

    setOtpStatus("idle");
    setErrorMsg(null);

    /** a paste fills the boxes from here onwards */
    if (typed.length > 1) {
      const next = [...digits];
      typed
        .slice(0, 6 - index)
        .split("")
        .forEach((character, offset) => {
          next[index + offset] = character;
        });
      setDigits(next);

      const landing = Math.min(index + typed.length, 5);
      digitRefs.current[landing]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = typed;
    setDigits(next);

    if (typed && index < 5) digitRefs.current[index + 1]?.focus();
  };

  const onDigitKeyPress = (index: number, key: string) => {
    if (key !== "Backspace") return;

    if (digits[index]) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    if (index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      digitRefs.current[index - 1]?.focus();
    }
  };

  /**
   * ============================================================
   * VERIFY
   * ============================================================
   */
  const handleVerify = async () => {
    if (loading) return;

    const code = digits.join("");

    if (code.length !== 6) {
      setOtpStatus("error");
      setErrorMsg("Please enter the full 6 digit code");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setOtpStatus("idle");

    try {
      const response = await fetch(TWO_FACTOR_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ tempToken, code }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        /** the boxes turn red and keep what was typed */
        setOtpStatus("error");
        setErrorMsg(data?.message || "That code did not work. Try again.");
        return;
      }

      const accessToken =
        data?.accessToken || data?.token || data?.access_token;

      if (!accessToken) {
        setOtpStatus("error");
        setErrorMsg("Verified, but the server did not return a token.");
        return;
      }

      const backendUser = data?.user || {};
      const userName = backendUser?.name || backendUser?.fullName || "User";
      const normalizedRole = String(
        backendUser?.role || data?.role || "EMPLOYEE"
      ).toUpperCase();

      setOtpStatus("success");

      await saveAuthSession({
        token: accessToken,
        remember,
        refreshToken: data?.refreshToken || data?.refresh_token || undefined,
        user: {
          id: backendUser?.id || backendUser?._id,
          name: userName,
          role: normalizedRole,
          email: backendUser?.email || (email || "").trim().toLowerCase(),
          mustChangePassword: !!backendUser?.mustChangePassword,
        },
      });

      /** let the green state land before the screen changes */
      setTimeout(() => navigateByRole(normalizedRole, userName), 450);
    } catch (err: any) {
      setOtpStatus("error");
      setErrorMsg(
        err?.message?.includes("Network request failed")
          ? "Cannot reach the backend. Check your connection."
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace("Login");
  };

  /**
   * ============================================================
   * LEAVING WITHOUT A FLICKER
   * ============================================================
   *
   * The keyboard hide and the screen transition are two separate
   * animations. Run together they resize this screen while it is
   * still sliding out, which reads as a flicker. So the first
   * back press only closes the keyboard, and the navigation is
   * replayed once the keyboard is actually gone. This covers the
   * back button, the hardware back and the swipe gesture alike.
   */
  const keyboardUp = useRef(false);
  const leaving = useRef(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = Keyboard.addListener(showEvent, () => {
      keyboardUp.current = true;
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      keyboardUp.current = false;
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (leaving.current || !keyboardUp.current) return;

      event.preventDefault();
      leaving.current = true;

      const hideEvent =
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

      /** replay the same action the moment the keyboard is down */
      const once = Keyboard.addListener(hideEvent, () => {
        once.remove();
        clearTimeout(fallback);
        navigation.dispatch(event.data.action);
      });

      /** the hide event never fires if the keyboard was already closing */
      const fallback = setTimeout(() => {
        once.remove();
        navigation.dispatch(event.data.action);
      }, 350);

      Keyboard.dismiss();
    });
  }, [navigation]);

  /**
   * ============================================================
   * UI
   * ============================================================
   */
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <LinearGradient
        colors={PASTEL}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobPink]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />

      <SafeAreaView style={styles.safe}>
        {/* fixed header, so the card can centre without moving it */}
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={backToLogin}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={{
                opacity: enterOpacity,
                transform: [{ translateY: enterShift }],
              }}
            >
              <View
                style={[
                  styles.shieldWrap,
                  otpStatus === "success" && styles.shieldSuccess,
                  otpStatus === "error" && styles.shieldError,
                ]}
              >
                <Ionicons
                  name={
                    otpStatus === "success"
                      ? "checkmark-circle"
                      : otpStatus === "error"
                      ? "close-circle"
                      : "shield-checkmark-outline"
                  }
                  size={30}
                  color={
                    otpStatus === "success"
                      ? "#059669"
                      : otpStatus === "error"
                      ? "#DC2626"
                      : "#111827"
                  }
                />
              </View>

              <Text style={styles.title}>Two factor verification</Text>
              <Text style={styles.subtitle}>
                Enter the 6 digit code from your authenticator app to finish
                signing in.
              </Text>

              {/* ---------------------------------------- the code */}
              <View style={styles.otpRow}>
                {digits.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(element) => {
                      digitRefs.current[index] = element;
                    }}
                    value={digit}
                    onChangeText={(value) => setDigitAt(index, value)}
                    onKeyPress={({ nativeEvent }) =>
                      onDigitKeyPress(index, nativeEvent.key)
                    }
                    keyboardType="number-pad"
                    textContentType={index === 0 ? "oneTimeCode" : "none"}
                    autoComplete={index === 0 ? "sms-otp" : "off"}
                    maxLength={6}
                    selectTextOnFocus
                    style={[
                      styles.otpBox,
                      !!digit && styles.otpBoxFilled,
                      otpStatus === "success" && styles.otpBoxSuccess,
                      otpStatus === "error" && styles.otpBoxError,
                    ]}
                  />
                ))}
              </View>

              {!!errorMsg && (
                <View style={styles.error}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color="#DC2626"
                  />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleVerify}
                disabled={loading || otpStatus === "success"}
                style={[
                  styles.button,
                  (loading || otpStatus === "success") && styles.buttonBusy,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>
                    {otpStatus === "success" ? "Verified" : "Verify"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={backToLogin}
                style={styles.backLink}
              >
                <Text style={styles.backLinkText}>Back to sign in</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const PASTEL = ["#F6E7F5", "#E7F0F6", "#EAF6E4", "#FBF7E4"] as const;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F5F3F7",
  },
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
    paddingVertical: 34,
  },

  blob: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    opacity: 0.5,
  },
  blobPink: {
    top: -110,
    left: -80,
    backgroundColor: "#F3D9F2",
  },
  blobMint: {
    bottom: -130,
    right: -90,
    backgroundColor: "#DCEFD5",
  },

  header: {
    paddingHorizontal: 26,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  shieldWrap: {
    width: 64,
    height: 64,
    borderRadius: 24,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
  },
  shieldSuccess: {
    backgroundColor: "rgba(209,250,229,0.9)",
    borderColor: "#6EE7B7",
  },
  shieldError: {
    backgroundColor: "rgba(254,226,226,0.9)",
    borderColor: "#FCA5A5",
  },

  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
  },
  otpBox: {
    width: 48,
    height: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.12)",
    backgroundColor: "rgba(255,255,255,0.55)",
    textAlign: "center",
    color: "#111827",
    fontSize: 22,
    fontWeight: "700",
  },
  otpBoxFilled: {
    borderColor: "rgba(17,24,39,0.45)",
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  otpBoxSuccess: {
    borderColor: "#10B981",
    backgroundColor: "rgba(209,250,229,0.75)",
    color: "#047857",
  },
  otpBoxError: {
    borderColor: "#EF4444",
    backgroundColor: "rgba(254,226,226,0.7)",
    color: "#B91C1C",
  },

  backLink: {
    alignSelf: "center",
    marginTop: 18,
    paddingVertical: 6,
  },
  backLinkText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
  },

  title: {
    color: "#111827",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 12,
  },

  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: "rgba(254,226,226,0.85)",
  },
  errorText: {
    flex: 1,
    color: "#991B1B",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },

  button: {
    height: 58,
    borderRadius: 29,
    backgroundColor: "#0B0B0F",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    shadowColor: "#0B0B0F",
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  buttonBusy: {
    opacity: 0.75,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
