import React, { useState, useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
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
import ConfirmDialog from "../components/ConfirmDialog";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

import {
  saveAuthSession,
  getAuthSession,
  clearAuthSession,
} from "../utils/authStorage";
import { isBiometricEnabled, verifyBiometric } from "../utils/biometrics";
import { useToast } from "../components/Toast";
import { API_BASE_URL, LOCAL_IP } from "../utils/api";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

/**
 * ============================================================
 * BACKEND CONFIGURATION
 * ============================================================
 *
 * The backend is deployed, so the address is the same from every
 * device and no network setup is involved. It lives in
 * utils/api.ts, which also carries the override for working
 * against a local server.
 */

const LOGIN_ENDPOINT = `${API_BASE_URL}/api/auth/login`;

const LOGO = require("../assets/ics-logo.png");

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { showToast } = useToast();

  /** every failure on this screen surfaces as a toast, top right */
  const showError = (message: string, title = "Login Failed") =>
    showToast({ type: "error", title, message });

  /** stay signed in on the next launch */
  const [remember, setRemember] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);

  /**
   * ============================================================
   * TWO FACTOR
   * ============================================================
   *
   * The backend answers a password login with twoFactorRequired
   * and a short lived tempToken. That token is handed to the
   * TwoFactor screen, which collects the six digit code and
   * exchanges it for the real session.
   */

  /**
   * ============================================================
   * ENTRANCE ANIMATION (handover from the splash screen)
   * ============================================================
   * Pure code driven: the card fades up once the saved-session
   * check is done, so it never fights the splash fade-out.
   */
  const enterOpacity = useRef(new Animated.Value(0)).current;
  const enterShift = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (checkingSession) return;

    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(enterShift, {
        toValue: 0,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkingSession]);

  /**
   * ============================================================
   * NAVIGATION BY ROLE
   * ============================================================
   */
  const navigateByRole = (roleStr: string, userName: string) => {
    const normalized = String(roleStr || "EMPLOYEE").toUpperCase();

    console.log("Navigating by role:", normalized);

    if (normalized === "ADMIN") {
      navigation.replace("AdminDashboard", {
        role: "ADMIN",
        name: userName,
      });
    } else if (normalized === "HR") {
      navigation.replace("HrDashboard", {
        role: "HR",
        name: userName,
      });
    } else {
      navigation.replace("UserDashboard", {
        role: "EMPLOYEE",
        name: userName,
      });
    }
  };

  /**
   * ============================================================
   * CHECK SAVED SESSION
   * ============================================================
   */
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const session = await getAuthSession();

        console.log("Saved session found:", !!session);

        if (
          mounted &&
          session?.token &&
          session?.user &&
          session.user.role &&
          session.remember !== false
        ) {
          console.log("Restoring session for:", session.user.email);
          console.log("Restored role:", session.user.role);

          /**
           * ----------------------------------------------------
           * BIOMETRIC GATE
           *
           * With biometric login on, a saved session is only
           * handed back after a successful fingerprint or face
           * check. A failed check drops the session, so this
           * launch falls through to email, password and 2FA.
           * ----------------------------------------------------
           */
          if (await isBiometricEnabled()) {
            const passed = await verifyBiometric(
              "Unlock your HRMS session"
            );

            if (!mounted) return;

            if (!passed) {
              console.log("Biometric check failed, session dropped");

              await clearAuthSession();

              showError(
                "Please sign in with your email and password.",
                "Biometric Check Failed"
              );

              return;
            }
          }

          if (!mounted) return;

          navigateByRole(
            session.user.role,
            session.user.name || "User"
          );

          return;
        }
      } catch (err) {
        console.error("Session restoration error:", err);
      } finally {
        if (mounted) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * ============================================================
   * LOGIN API
   * ============================================================
   */
  const handleLogin = async () => {
    if (loading) {
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password.trim()) {
      showError("Please enter your email and password.", "Missing Details");
      return;
    }

    setLoading(true);

    console.log("------------------------------------");
    console.log("LOGIN START");
    console.log("LOGIN URL:", LOGIN_ENDPOINT);
    console.log("EMAIL:", cleanEmail);
    console.log("------------------------------------");

    try {
      /**
       * --------------------------------------------------------
       * SEND LOGIN REQUEST
       * --------------------------------------------------------
       */
      const response = await fetch(LOGIN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: password,
        }),
      });

      /**
       * --------------------------------------------------------
       * READ RESPONSE AS TEXT FIRST
       *
       * This prevents JSON parsing errors from hiding the
       * actual backend response.
       * --------------------------------------------------------
       */
      const responseText = await response.text();

      console.log("LOGIN HTTP STATUS:", response.status);
      console.log("LOGIN RAW RESPONSE:", responseText);

      let data: any = null;

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error("Backend returned invalid JSON:", parseError);

          throw new Error(
            `Backend returned an invalid response (${response.status}).`
          );
        }
      }

      /**
       * --------------------------------------------------------
       * HANDLE HTTP ERROR
       * --------------------------------------------------------
       */
      if (!response.ok) {
        const backendMessage =
          data?.message ||
          data?.error ||
          data?.msg ||
          `Login failed (${response.status})`;

        throw new Error(backendMessage);
      }

      /**
       * --------------------------------------------------------
       * TWO FACTOR CHALLENGE
       *
       * No session yet: the backend hands back a short lived
       * tempToken and waits for the authenticator code.
       * --------------------------------------------------------
       */
      if (data?.twoFactorRequired) {
        setPassword("");
        navigation.navigate("TwoFactor", {
          tempToken: data.tempToken,
          email: email.trim().toLowerCase(),
          remember,
        });
        return;
      }

      /**
       * --------------------------------------------------------
       * VALIDATE ACCESS TOKEN
       *
       * Your other API requests depend on this token.
       * --------------------------------------------------------
       */
      const accessToken =
        data?.accessToken ||
        data?.token ||
        data?.access_token;

      if (!accessToken) {
        console.error("Login response does not contain token:", data);

        throw new Error(
          "Login succeeded, but the server did not return an access token."
        );
      }

      /**
       * --------------------------------------------------------
       * GET USER DATA
       * --------------------------------------------------------
       */
      const backendUser = data?.user || data?.data?.user || {};

      const userId =
        backendUser?.id ||
        backendUser?._id ||
        data?.userId ||
        data?.id;

      const userName =
        backendUser?.name ||
        backendUser?.fullName ||
        data?.name ||
        "User";

      const userEmail =
        backendUser?.email ||
        cleanEmail;

      const rawRole =
        backendUser?.role ||
        data?.role ||
        "EMPLOYEE";

      const normalizedRole = String(rawRole).toUpperCase();

      /**
       * --------------------------------------------------------
       * DEBUG LOGIN DATA
       * --------------------------------------------------------
       */
      console.log("------------------------------------");
      console.log("LOGIN SUCCESS");
      console.log("USER ID:", userId);
      console.log("USER NAME:", userName);
      console.log("USER EMAIL:", userEmail);
      console.log("USER ROLE:", normalizedRole);
      console.log("ACCESS TOKEN RECEIVED:", !!accessToken);
      console.log("REFRESH TOKEN RECEIVED:", !!data?.refreshToken);
      console.log("------------------------------------");

      /**
       * --------------------------------------------------------
       * SAVE REAL AUTH SESSION
       * --------------------------------------------------------
       */
      await saveAuthSession({
        token: accessToken,

        remember,

        refreshToken:
          data?.refreshToken ||
          data?.refresh_token ||
          undefined,

        user: {
          id: userId,
          name: userName,
          role: normalizedRole,
          email: userEmail,
          mustChangePassword: !!backendUser?.mustChangePassword,
        },
      });

      console.log("Auth session saved successfully.");

      /**
       * --------------------------------------------------------
       * NAVIGATE
       * --------------------------------------------------------
       */
      navigateByRole(normalizedRole, userName);
    } catch (err: any) {
      
      console.error("------------------------------------");
      console.error("LOGIN ERROR");
      console.error("Error:", err);
      console.error("Message:", err?.message);
      console.error("------------------------------------");

      let message = "Unable to login.";

      if (
        err?.message?.includes("Network request failed") ||
        err?.message?.includes("Failed to fetch")
      ) {
        console.log(`Backend unreachable at ${LOCAL_IP}.`);

        message = "Cannot reach the server. Check your internet connection.";
      } else if (err?.name === "AbortError") {
        message = "Login request timed out. Check your backend connection.";
      } else if (err?.message) {
        message = err.message;
      }

      showError(message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * ============================================================
   * UI
   * ============================================================
   */
  if (checkingSession) {
    return (
      <View style={styles.booting}>
        <LinearGradient
          colors={PASTEL}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.bootingText}>Restoring session</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* soft pastel wash, brightest under the form */}
      <LinearGradient
        colors={PASTEL}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobPink]} pointerEvents="none" />
      <View style={[styles.blob, styles.blobMint]} pointerEvents="none" />

      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
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
              <Image source={LOGO} style={styles.logo} resizeMode="contain" />

              <Text style={styles.title}>Welcome back 👋</Text>
              <Text style={styles.subtitle}>
                Log in to your workspace and get started.
              </Text>


              {/* ------------------------------------------- email */}
              <Text style={styles.label}>E-mail</Text>
              <View style={[styles.field, emailFocused && styles.fieldFocused]}>
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={emailFocused ? "#111827" : "#9CA3AF"}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder="example@gmail.com"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>

              {/* ---------------------------------------- password */}
              <Text style={styles.label}>Password</Text>
              <View
                style={[styles.field, passwordFocused && styles.fieldFocused]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={passwordFocused ? "#111827" : "#9CA3AF"}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  placeholder="Enter your password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  style={styles.input}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((shown) => !shown)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color="#6B7280"
                  />
                </TouchableOpacity>
              </View>

              {/* -------------------------------------------- meta */}
              <View style={styles.metaRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setRemember((on) => !on)}
                  style={styles.rememberRow}
                >
                  <View style={[styles.checkbox, remember && styles.checkboxOn]}>
                    {remember && (
                      <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={styles.rememberText}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setForgotOpen(true)}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>

              {/* ------------------------------------------ action */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleLogin}
                disabled={loading}
                style={[styles.button, loading && styles.buttonBusy]}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonText}>Log in</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.footer}>
                Trouble signing in? Contact your HR administrator.
              </Text>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ConfirmDialog
        visible={forgotOpen}
        icon="key-outline"
        title="Forgot password?"
        message="Password resets are handled by your HR administrator. Reach out to them and they will issue a new one."
        onClose={() => setForgotOpen(false)}
      />
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

  booting: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3F7",
  },
  bootingText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
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

  logo: {
    width: 84,
    height: 84,
    alignSelf: "center",
    marginBottom: 18,
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

  label: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 22,
    marginBottom: 8,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 56,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.10)",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  fieldFocused: {
    borderColor: "rgba(17,24,39,0.45)",
    backgroundColor: "rgba(255,255,255,0.78)",
  },
  input: {
    flex: 1,
    color: "#111827",
    fontSize: 15,
    fontWeight: "500",
    height: "100%",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 19,
    height: 19,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  checkboxOn: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  rememberText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "500",
  },
  forgotText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },


  button: {
    height: 58,
    borderRadius: 16,
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

  footer: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 22,
  },
});
