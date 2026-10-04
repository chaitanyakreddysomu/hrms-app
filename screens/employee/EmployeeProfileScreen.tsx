import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";

import { getAuthSession } from "../../utils/authStorage";
import { API_BASE_URL, apiFetch } from "../../utils/api";
import {
  useRegisterScreenAction,
  useShellScroll,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  BiometricSupport,
  getBiometricSupport,
  isBiometricEnabled,
  setBiometricEnabled,
  verifyBiometric,
} from "../../utils/biometrics";
import { useNotificationToggle } from "../../components/useNotificationToggle";
import {
  Card,
  DateField,
  IconTile,
  Loading,
  PrimaryButton,
  Row,
  SectionTitle,
  formatDate,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";
import UpdateSheet from "../../components/UpdateSheet";

/**
 * ============================================================
 * MY PROFILE
 * ============================================================
 *
 * Reads GET /api/employee/profile, saves the editable fields to
 * PATCH on the same path, and puts a new photo on
 * POST /api/employee/profile-image, the way the web page does.
 * Biometric login lives here too, guarding the saved session.
 */
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

interface Props {
  profilePath?: string;
  imagePath?: string;
  /** the profile route that accepts the edit, PATCH either way */
  savePath?: string;
}

export default function EmployeeProfileScreen({
  profilePath = "/api/employee/profile",
  imagePath = "/api/employee/profile-image",
  savePath,
}: Props = {}) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageStamp, setImageStamp] = useState(Date.now());

  const [picked, setPicked] =
    useState<ImagePicker.ImagePickerAsset | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    dob: "",
    bloodGroup: "",
    emergencyName: "",
    emergencyPhone: "",
    bankHolderName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankName: "",
    bankBranch: "",
  });

  /** auto-filled from the IFSC lookup, same as the web profile page */
  const [fetchingBankDetails, setFetchingBankDetails] = useState(false);

  /* ============================================================
     BIOMETRIC LOGIN
     ============================================================ */
  /* ============================================================
     NOTIFICATIONS
     ============================================================ */
  const push = useNotificationToggle({
    onResult: ({ ok, title, message }) =>
      showToast({ type: ok ? "success" : "error", title, message }),
  });

  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);

  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [support, setSupport] = useState<BiometricSupport>({
    available: false,
    enrolled: false,
    label: "Biometric login",
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      const found = await getBiometricSupport();
      const enabled = await isBiometricEnabled();

      if (!alive) return;

      setSupport(found);
      setBiometricOn(enabled && found.available && found.enrolled);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const toggleBiometric = async () => {
    if (biometricBusy) return;

    if (!support.available || !support.enrolled) {
      showToast({
        type: "warning",
        title: "Not Available",
        message: support.available
          ? "Add a fingerprint or face in device settings first."
          : "This device has no biometric sensor.",
      });

      return;
    }

    setBiometricBusy(true);

    try {
      const passed = await verifyBiometric(
        biometricOn
          ? "Confirm to turn off biometric login"
          : "Confirm to enable biometric login"
      );

      if (!passed) {
        showToast({
          type: "error",
          title: "Not Verified",
          message: biometricOn
            ? "Biometric login is still on."
            : "Biometric login was not enabled.",
        });

        return;
      }

      await setBiometricEnabled(!biometricOn);
      setBiometricOn(!biometricOn);

      showToast({
        type: biometricOn ? "info" : "success",
        title: biometricOn ? "Biometric Login Off" : "Biometric Login On",
        message: biometricOn
          ? "You will sign in with your password from now on."
          : "Reopening the app will unlock your session.",
      });
    } finally {
      setBiometricBusy(false);
    }
  };

  /* ============================================================
     TWO FACTOR AUTHENTICATION
     ============================================================
     
     The same /api/auth/2fa endpoints the admin console uses:
     status, setup for the QR and secret, verify to switch it on,
     and disable, which now needs a current code of its own.
  */
  const [twoFactorOn, setTwoFactorOn] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);

  const [setupData, setSetupData] = useState<{
    secret: string;
    qrCodeDataUrl: string;
  } | null>(null);

  const [code, setCode] = useState("");
  const [disarmOpen, setDisarmOpen] = useState(false);
  const [disarmCode, setDisarmCode] = useState("");

  const loadTwoFactor = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/auth/2fa/status", session.token);

      if (res.ok) {
        const data = await res.json().catch(() => null);
        setTwoFactorOn(Boolean(data?.twoFactorEnabled));
      }
    } catch (error) {
      console.error("2FA status error:", error);
    }
  }, []);

  useEffect(() => {
    loadTwoFactor();
  }, [loadTwoFactor]);

  const openSecurity = () => {
    setSetupData(null);
    setCode("");
    setDisarmOpen(false);
    setDisarmCode("");
    setSecurityOpen(true);
  };

  const startSetup = async () => {
    if (securityBusy) return;

    setSecurityBusy(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/auth/2fa/setup", session.token, {
        method: "POST",
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.qrCodeDataUrl) {
        showToast({
          type: "error",
          title: "Setup Failed",
          message: data?.message || "Could not start two factor setup.",
        });

        return;
      }

      setSetupData({
        secret: data.secret,
        qrCodeDataUrl: data.qrCodeDataUrl,
      });
    } catch (error) {
      console.error("2FA setup error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setSecurityBusy(false);
    }
  };

  const copySecret = async () => {
    if (!setupData?.secret) return;

    await Clipboard.setStringAsync(setupData.secret);

    showToast({
      type: "success",
      title: "Copied",
      message: "The setup key is on your clipboard.",
    });
  };

  const verifyTwoFactor = async () => {
    if (securityBusy) return;

    if (code.replace(/\D/g, "").length !== 6) {
      showToast({
        type: "error",
        title: "Code Required",
        message: "Enter the 6 digit code from your authenticator.",
      });

      return;
    }

    setSecurityBusy(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/auth/2fa/verify", session.token, {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Wrong Code",
          message: data?.message || "That code was not accepted.",
        });

        return;
      }

      setTwoFactorOn(true);
      setSetupData(null);
      setCode("");

      showToast({
        type: "success",
        title: "2FA Enabled",
        message: "Logging in will now ask for a code.",
      });
    } catch (error) {
      console.error("2FA verify error:", error);
    } finally {
      setSecurityBusy(false);
    }
  };

  const disableTwoFactor = async () => {
    if (securityBusy) return;

    const clean = disarmCode.replace(/\D/g, "");

    if (clean.length !== 6) {
      showToast({
        type: "error",
        title: "Code Required",
        message: "Enter the current 6 digit code to switch it off.",
      });

      return;
    }

    setSecurityBusy(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/auth/2fa/disable", session.token, {
        method: "POST",
        body: JSON.stringify({ code: clean }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Not Disabled",
          message: data?.message || "That code was not accepted.",
        });

        return;
      }

      setTwoFactorOn(false);
      setDisarmOpen(false);
      setDisarmCode("");

      showToast({
        type: "info",
        title: "2FA Disabled",
        message: "Logging in will no longer ask for a code.",
      });
    } catch (error) {
      console.error("2FA disable error:", error);
    } finally {
      setSecurityBusy(false);
    }
  };

  /* ============================================================
     PROFILE
     ============================================================ */
  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(profilePath, session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Profile Unavailable",
          message: "Could not load your details.",
        });

        return;
      }

      setProfile(await res.json());
    } catch (error) {
      console.error("Profile load error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profilePath]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = () => {
    if (!profile) return;

    setForm({
      name: profile.name || "",
      phone: profile.phone || "",
      address: profile.address || "",
      dob: profile.dob ? String(profile.dob).split("T")[0] : "",
      bloodGroup: profile.bloodGroup || "",
      emergencyName: profile.emergencyContact?.name || "",
      emergencyPhone: profile.emergencyContact?.phone || "",
      bankHolderName: profile.bankDetails?.holderName || "",
      bankAccountNumber: profile.bankDetails?.accountNumber || "",
      bankIfsc: profile.bankDetails?.ifsc || "",
      bankName: profile.bankDetails?.bankName || "",
      bankBranch: profile.bankDetails?.branch || "",
    });

    setPicked(null);
    setEditOpen(true);
  };

  useRegisterScreenAction("editProfile", openEdit);

  const pickImage = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showToast({
        type: "warning",
        title: "Permission Needed",
        message: "Allow photo access to change your picture.",
      });

      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) setPicked(result.assets[0]);
  };

  /**
   * Same lookup the web profile page uses: once the IFSC is a full 11
   * characters, fetch the bank name and branch so the person never
   * types them by hand.
   */
  const handleIfscChange = async (raw: string) => {
    const value = raw.toUpperCase();
    setForm((f) => ({ ...f, bankIfsc: value }));

    if (value.length !== 11) return;

    setFetchingBankDetails(true);
    try {
      const response = await fetch(`https://ifsc.razorpay.com/${value}`);
      if (response.ok) {
        const data = await response.json();
        setForm((f) => ({
          ...f,
          bankIfsc: value,
          bankName: data.BANK,
          bankBranch: data.BRANCH,
        }));
      }
    } catch {
      // offline or an invalid code - leave bank name/branch as they were
    } finally {
      setFetchingBankDetails(false);
    }
  };

  const save = async () => {
    if (saving) return;

    if (!form.name.trim()) {
      showToast({
        type: "error",
        title: "Name Required",
        message: "Enter your full name.",
      });

      return;
    }

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      /* the photo first, on its own multipart endpoint */
      if (picked) {
        const form2 = new FormData();

        form2.append("image", {
          uri: picked.uri,
          name: picked.fileName || picked.uri.split("/").pop() || "photo.jpg",
          type: picked.mimeType || "image/jpeg",
        } as any);

        const imgRes = await fetch(
          `${API_BASE_URL}${imagePath}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${session.token}` },
            body: form2,
          }
        );

        if (!imgRes.ok) {
          const imgData = await imgRes.json().catch(() => null);

          showToast({
            type: "error",
            title: "Upload Failed",
            message: imgData?.message || "Could not upload your picture.",
          });

          return;
        }
      }

      const res = await apiFetch(savePath || profilePath, session.token, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          address: form.address,
          dob: form.dob,
          bloodGroup: form.bloodGroup,
          emergencyContact: {
            name: form.emergencyName,
            phone: form.emergencyPhone,
          },
          bankDetails: {
            holderName: form.bankHolderName,
            accountNumber: form.bankAccountNumber,
            ifsc: form.bankIfsc,
            bankName: form.bankName,
            branch: form.bankBranch,
          },
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Update Failed",
          message: body?.message || "Your changes were not saved.",
        });

        return;
      }

      setProfile((prev: any) => ({ ...prev, ...(body?.user || body) }));

      if (picked) setImageStamp(Date.now());

      setPicked(null);
      setEditOpen(false);

      showToast({
        type: "success",
        title: "Profile Updated",
        message: "Your details have been saved.",
      });

      load();
    } catch (error) {
      console.error("Profile save error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, paddingTop: shellTop }}>
        <Loading label="Loading profile" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        {...shellScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: shellTop, paddingBottom: 150 }}
        refreshControl={
          <RefreshControl
          progressViewOffset={shellTop}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#2563EB"
          />
        }
      >
        {/* IDENTITY */}

        <Card style={{ alignItems: "center", paddingVertical: 24 }}>
          {profile?.profileImage ? (
            <Image
              source={{ uri: `${profile.profileImage}?t=${imageStamp}` }}
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: "#F1F5F9",
              }}
            />
          ) : (
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: "#2563EB",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 36,
                  fontWeight: "800",
                }}
              >
                {(profile?.name || "U").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          <Text
            style={{
              color: "#0F172A",
              fontSize: 19,
              fontWeight: "800",
              marginTop: 14,
            }}
          >
            {profile?.name || "Employee"}
          </Text>

          <Text
            style={{
              color: "#94A3B8",
              fontSize: 12,
              fontWeight: "600",
              marginTop: 3,
            }}
          >
            {profile?.designation || "Employee"}
            {profile?.department ? `  ${profile.department}` : ""}
          </Text>
        </Card>

        <SectionTitle>Work</SectionTitle>

        <Card>
          <Row label="Employee ID" value={profile?.id} />
          <Row label="Email" value={profile?.email} />
          <Row label="Department" value={profile?.department} />
          <Row label="Designation" value={profile?.designation} />
          <Row label="Joined" value={formatDate(profile?.joiningDate)} last />
        </Card>

        <SectionTitle>Personal</SectionTitle>

        <Card>
          <Row label="Phone" value={profile?.phone} />
          <Row label="Address" value={profile?.address} />
          <Row label="Date of birth" value={formatDate(profile?.dob)} />
          <Row label="Blood group" value={profile?.bloodGroup} />
          <Row label="UAN" value={profile?.uan} last />
        </Card>

        <SectionTitle>Bank details</SectionTitle>

        <Card>
          <Row label="Account holder" value={profile?.bankDetails?.holderName} />
          <Row label="Account number" value={profile?.bankDetails?.accountNumber} />
          <Row label="IFSC" value={profile?.bankDetails?.ifsc} />
          <Row label="Bank name" value={profile?.bankDetails?.bankName} />
          <Row label="Branch" value={profile?.bankDetails?.branch} last />
        </Card>

        <SectionTitle>Emergency contact</SectionTitle>

        <Card>
          <Row label="Name" value={profile?.emergencyContact?.name} />
          <Row
            label="Phone"
            value={profile?.emergencyContact?.phone}
            last
          />
        </Card>

        <SectionTitle>Security</SectionTitle>

        <Card onPress={openSecurity}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconTile
              icon={twoFactorOn ? "shield-checkmark" : "shield-outline"}
              tone={twoFactorOn ? "green" : "red"}
            />

            <View style={{ flex: 1, marginLeft: 14 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center" }}
              >
                <Text
                  style={{
                    color: "#0F172A",
                    fontSize: 14,
                    fontWeight: "800",
                  }}
                >
                  Security and 2FA
                </Text>

                <View
                  style={{
                    marginLeft: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: twoFactorOn ? "#ECFDF5" : "#FEF2F2",
                  }}
                >
                  <Text
                    style={{
                      color: twoFactorOn ? "#047857" : "#B91C1C",
                      fontSize: 10,
                      fontWeight: "800",
                    }}
                  >
                    {twoFactorOn ? "Enabled" : "Disabled"}
                  </Text>
                </View>
              </View>

              <Text
                style={{
                  color: "#94A3B8",
                  fontSize: 11,
                  fontWeight: "600",
                  marginTop: 3,
                }}
              >
                {twoFactorOn
                  ? "Login asks for an authenticator code"
                  : "Add a second step to your login"}
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
          </View>
        </Card>

        <Card onPress={toggleBiometric}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconTile
              icon={
                support.label === "Face unlock" ? "scan-outline" : "finger-print"
              }
              tone={biometricOn ? "green" : "red"}
            />

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 14,
                  fontWeight: "800",
                }}
              >
                Biometric Login
              </Text>

              <Text
                style={{
                  color: "#94A3B8",
                  fontSize: 11,
                  fontWeight: "600",
                  marginTop: 3,
                }}
              >
                {!support.available
                  ? "This device has no biometric sensor"
                  : !support.enrolled
                  ? "Add a fingerprint or face in device settings"
                  : biometricOn
                  ? "Reopening the app unlocks your session"
                  : "Unlock without retyping your password"}
              </Text>
            </View>

            <Ionicons
              name="toggle"
              size={30}
              color={biometricOn ? "#059669" : "#DC2626"}
              style={biometricOn ? undefined : { transform: [{ scaleX: -1 }] }}
            />
          </View>
        </Card>

        <Card onPress={push.blocked ? push.openSettings : push.toggle}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconTile
              icon={push.on ? "notifications" : "notifications-off-outline"}
              tone={push.on ? "green" : "red"}
            />

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text
                style={{ color: "#0F172A", fontSize: 15, fontWeight: "700" }}
              >
                Notifications
              </Text>
              <Text
                style={{
                  color: "#64748B",
                  fontSize: 12,
                  fontWeight: "600",
                  marginTop: 3,
                }}
              >
                {push.blocked
                  ? "Blocked in system settings, tap to open them"
                  : push.busy
                  ? "Working"
                  : push.on
                  ? "This device receives alerts"
                  : "Turn on to receive alerts on this device"}
              </Text>
            </View>

            {push.busy ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Ionicons
                name="toggle"
                size={30}
                color={push.on ? "#059669" : "#DC2626"}
                style={push.on ? undefined : { transform: [{ scaleX: -1 }] }}
              />
            )}
          </View>
        </Card>

        <Card onPress={() => setUpdateSheetOpen(true)}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconTile icon="cloud-download-outline" tone="blue" />

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text
                style={{ color: "#0F172A", fontSize: 15, fontWeight: "700" }}
              >
                App Update
              </Text>
              <Text
                style={{
                  color: "#64748B",
                  fontSize: 12,
                  fontWeight: "600",
                  marginTop: 3,
                }}
              >
                Check for the latest version
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
        </Card>
      </ScrollView>

      <UpdateSheet
        visible={updateSheetOpen}
        onClose={() => setUpdateSheetOpen(false)}
      />

      {/* ============================================================
          SECURITY AND 2FA
      ============================================================ */}

      <Modal
        visible={securityOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !securityBusy && setSecurityOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => !securityBusy && setSecurityOpen(false)}
          />

          <View
            style={{
              maxHeight: "88%",
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 28,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: "#D1D5DB",
                }}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 20,
                  fontWeight: "800",
                }}
              >
                Security settings
              </Text>

              <TouchableOpacity
                onPress={() => !securityBusy && setSecurityOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {twoFactorOn ? (
                /* ---------------------------------------- ENABLED */
                <Card style={{ backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }}>
                  <View
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <IconTile icon="shield-checkmark" tone="green" />

                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text
                        style={{
                          color: "#065F46",
                          fontSize: 14,
                          fontWeight: "800",
                        }}
                      >
                        Your account is protected
                      </Text>

                      <Text
                        style={{
                          color: "#047857",
                          fontSize: 11,
                          fontWeight: "600",
                          marginTop: 3,
                        }}
                      >
                        A code is required every time you log in
                      </Text>
                    </View>
                  </View>

                  {disarmOpen ? (
                    <View style={{ marginTop: 16 }}>
                      <Text
                        style={{
                          color: "#374151",
                          fontSize: 12,
                          fontWeight: "700",
                          marginBottom: 8,
                        }}
                      >
                        Enter your current code to switch it off
                      </Text>

                      <TextInput
                        value={disarmCode}
                        onChangeText={(v) =>
                          setDisarmCode(v.replace(/\D/g, "").slice(0, 6))
                        }
                        keyboardType="number-pad"
                        maxLength={6}
                        placeholder="000000"
                        placeholderTextColor="#9CA3AF"
                        autoFocus
                        style={{
                          height: 58,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          backgroundColor: "#FFFFFF",
                          textAlign: "center",
                          fontSize: 22,
                          fontWeight: "800",
                          letterSpacing: 8,
                          color: "#111827",
                        }}
                      />

                      <View style={{ flexDirection: "row", marginTop: 14 }}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            setDisarmOpen(false);
                            setDisarmCode("");
                          }}
                          disabled={securityBusy}
                          style={{
                            flex: 1,
                            height: 46,
                            borderRadius: 14,
                            backgroundColor: "#FFFFFF",
                            borderWidth: 1,
                            borderColor: "#E5E7EB",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: "#374151",
                              fontSize: 13,
                              fontWeight: "700",
                            }}
                          >
                            Keep protection
                          </Text>
                        </TouchableOpacity>

                        <PrimaryButton
                          label="Disable 2FA"
                          onPress={disableTwoFactor}
                          busy={securityBusy}
                          disabled={disarmCode.length !== 6}
                          tone="red"
                          style={{ flex: 1, height: 46, marginLeft: 8 }}
                        />
                      </View>
                    </View>
                  ) : (
                    <PrimaryButton
                      label="Disable 2FA protection"
                      icon="shield-outline"
                      onPress={() => setDisarmOpen(true)}
                      tone="red"
                      style={{ marginTop: 16 }}
                    />
                  )}
                </Card>
              ) : setupData ? (
                /* ------------------------------------------ SETUP */
                <>
                  <Card>
                    <Text
                      style={{
                        color: "#0F172A",
                        fontSize: 14,
                        fontWeight: "800",
                      }}
                    >
                      Scan this with your authenticator
                    </Text>

                    <Text
                      style={{
                        color: "#94A3B8",
                        fontSize: 11,
                        fontWeight: "600",
                        marginTop: 4,
                      }}
                    >
                      Google Authenticator, Authy or any TOTP app
                    </Text>

                    <View style={{ alignItems: "center", marginTop: 16 }}>
                      <Image
                        source={{ uri: setupData.qrCodeDataUrl }}
                        style={{
                          width: 190,
                          height: 190,
                          borderRadius: 16,
                          backgroundColor: "#FFFFFF",
                        }}
                      />
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={copySecret}
                      style={{
                        marginTop: 16,
                        padding: 14,
                        borderRadius: 14,
                        backgroundColor: "#F8FAFC",
                        borderWidth: 1,
                        borderColor: "#EEF2F7",
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: "#94A3B8",
                            fontSize: 10,
                            fontWeight: "800",
                            letterSpacing: 0.8,
                            textTransform: "uppercase",
                          }}
                        >
                          Manual setup key
                        </Text>

                        <Text
                          style={{
                            color: "#0F172A",
                            fontSize: 12,
                            fontWeight: "700",
                            marginTop: 3,
                          }}
                          numberOfLines={1}
                        >
                          {setupData.secret}
                        </Text>
                      </View>

                      <Ionicons
                        name="copy-outline"
                        size={18}
                        color="#2563EB"
                      />
                    </TouchableOpacity>
                  </Card>

                  <Card>
                    <Text
                      style={{
                        color: "#374151",
                        fontSize: 12,
                        fontWeight: "700",
                        marginBottom: 8,
                      }}
                    >
                      Enter the 6 digit code it shows
                    </Text>

                    <TextInput
                      value={code}
                      onChangeText={(v) =>
                        setCode(v.replace(/\D/g, "").slice(0, 6))
                      }
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="000000"
                      placeholderTextColor="#9CA3AF"
                      style={{
                        height: 58,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                        backgroundColor: "#F9FAFB",
                        textAlign: "center",
                        fontSize: 22,
                        fontWeight: "800",
                        letterSpacing: 8,
                        color: "#111827",
                      }}
                    />

                    <View style={{ flexDirection: "row", marginTop: 14 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setSetupData(null);
                          setCode("");
                        }}
                        disabled={securityBusy}
                        style={{
                          flex: 1,
                          height: 46,
                          borderRadius: 14,
                          backgroundColor: "#F3F4F6",
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 8,
                        }}
                      >
                        <Text
                          style={{
                            color: "#374151",
                            fontSize: 13,
                            fontWeight: "700",
                          }}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>

                      <PrimaryButton
                        label="Verify and enable"
                        onPress={verifyTwoFactor}
                        busy={securityBusy}
                        disabled={code.length !== 6}
                        style={{ flex: 1, height: 46, marginLeft: 8 }}
                      />
                    </View>
                  </Card>
                </>
              ) : (
                /* --------------------------------------- DISABLED */
                <Card>
                  <View
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <IconTile icon="shield-outline" tone="red" />

                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text
                        style={{
                          color: "#0F172A",
                          fontSize: 14,
                          fontWeight: "800",
                        }}
                      >
                        Two factor is off
                      </Text>

                      <Text
                        style={{
                          color: "#94A3B8",
                          fontSize: 11,
                          fontWeight: "600",
                          marginTop: 3,
                        }}
                      >
                        Your password alone can open this account
                      </Text>
                    </View>
                  </View>

                  <PrimaryButton
                    label="Set up two factor"
                    icon="shield-checkmark-outline"
                    onPress={startSetup}
                    busy={securityBusy}
                    style={{ marginTop: 16 }}
                  />
                </Card>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ============================================================
          EDIT PROFILE
      ============================================================ */}

      <Modal
        visible={editOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setEditOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => !saving && setEditOpen(false)}
          />

          <View
            style={{
              maxHeight: "88%",
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 28,
            }}
          >
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <View
                style={{
                  width: 44,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: "#D1D5DB",
                }}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 20,
                  fontWeight: "800",
                }}
              >
                Edit profile
              </Text>

              <TouchableOpacity
                onPress={() => !saving && setEditOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* PHOTO, current beside the replacement */}

              <View style={{ alignItems: "center", marginTop: 18 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <View style={{ alignItems: "center" }}>
                    {profile?.profileImage ? (
                      <Image
                        source={{
                          uri: `${profile.profileImage}?t=${imageStamp}`,
                        }}
                        style={{
                          width: 76,
                          height: 76,
                          borderRadius: 38,
                          backgroundColor: "#F1F5F9",
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 76,
                          height: 76,
                          borderRadius: 38,
                          backgroundColor: "#F1F5F9",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="person" size={34} color="#94A3B8" />
                      </View>
                    )}

                    <Text
                      style={{
                        color: "#94A3B8",
                        fontSize: 11,
                        fontWeight: "700",
                        marginTop: 6,
                      }}
                    >
                      Current
                    </Text>
                  </View>

                  {!!picked && (
                    <>
                      <Ionicons
                        name="arrow-forward"
                        size={18}
                        color="#94A3B8"
                        style={{ marginHorizontal: 14 }}
                      />

                      <View style={{ alignItems: "center" }}>
                        <Image
                          source={{ uri: picked.uri }}
                          style={{
                            width: 76,
                            height: 76,
                            borderRadius: 38,
                            borderWidth: 2,
                            borderColor: "#2563EB",
                          }}
                        />

                        <Text
                          style={{
                            color: "#2563EB",
                            fontSize: 11,
                            fontWeight: "800",
                            marginTop: 6,
                          }}
                        >
                          New
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                <View
                  style={{ flexDirection: "row", marginTop: 14 }}
                >
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={pickImage}
                    disabled={saving}
                    style={{
                      height: 40,
                      paddingHorizontal: 16,
                      borderRadius: 20,
                      backgroundColor: "#2563EB",
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name="camera" size={16} color="#FFFFFF" />

                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: 12,
                        fontWeight: "700",
                        marginLeft: 8,
                      }}
                    >
                      {picked ? "Choose another" : "Change photo"}
                    </Text>
                  </TouchableOpacity>

                  {!!picked && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setPicked(null)}
                      disabled={saving}
                      style={{
                        height: 40,
                        paddingHorizontal: 16,
                        borderRadius: 20,
                        backgroundColor: "#F3F4F6",
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                        flexDirection: "row",
                        alignItems: "center",
                        marginLeft: 8,
                      }}
                    >
                      <Ionicons name="close" size={16} color="#6B7280" />

                      <Text
                        style={{
                          color: "#374151",
                          fontSize: 12,
                          fontWeight: "700",
                          marginLeft: 6,
                        }}
                      >
                        Undo
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <Field
                label="Full name"
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              />

              <Field
                label="Phone"
                value={form.phone}
                keyboardType="phone-pad"
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              />

              <Field
                label="Address"
                value={form.address}
                multiline
                onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
              />

              <DateField
                label="Date of birth"
                value={form.dob}
                maximumDate={new Date()}
                onChange={(v) => setForm((f) => ({ ...f, dob: v }))}
              />

              <Text
                style={{
                  color: "#374151",
                  fontSize: 12,
                  fontWeight: "700",
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                Blood group
              </Text>

              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {BLOOD_GROUPS.map((group) => {
                  const on = form.bloodGroup === group;

                  return (
                    <TouchableOpacity
                      key={group}
                      activeOpacity={0.8}
                      onPress={() =>
                        setForm((f) => ({ ...f, bloodGroup: group }))
                      }
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: on ? "#2563EB" : "#E5E7EB",
                        backgroundColor: on ? "#2563EB" : "#F9FAFB",
                      }}
                    >
                      <Text
                        style={{
                          color: on ? "#FFFFFF" : "#374151",
                          fontSize: 12,
                          fontWeight: on ? "800" : "600",
                        }}
                      >
                        {group}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text
                style={{
                  color: "#374151",
                  fontSize: 12,
                  fontWeight: "700",
                  marginTop: 24,
                  marginBottom: 8,
                }}
              >
                Bank details
              </Text>

              <Field
                label="Account holder name"
                value={form.bankHolderName}
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, bankHolderName: v }))
                }
              />

              <Field
                label="Account number"
                value={form.bankAccountNumber}
                keyboardType="default"
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, bankAccountNumber: v }))
                }
              />

              <Field
                label="IFSC code"
                value={form.bankIfsc}
                placeholder="e.g. SBIN0011991"
                onChangeText={handleIfscChange}
              />

              <Field
                label="Bank name"
                value={form.bankName}
                editable={false}
                loading={fetchingBankDetails}
                placeholder="Auto-filled from IFSC"
                onChangeText={() => {}}
              />

              <Field
                label="Branch"
                value={form.bankBranch}
                editable={false}
                loading={fetchingBankDetails}
                placeholder="Auto-filled from IFSC"
                onChangeText={() => {}}
              />

              <Field
                label="Emergency contact name"
                value={form.emergencyName}
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, emergencyName: v }))
                }
              />

              <Field
                label="Emergency contact phone"
                value={form.emergencyPhone}
                keyboardType="phone-pad"
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, emergencyPhone: v }))
                }
              />

              <PrimaryButton
                label="Save changes"
                onPress={save}
                busy={saving}
                style={{ marginTop: 26, marginBottom: 12 }}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline,
  editable = true,
  loading = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "phone-pad" | "email-address";
  multiline?: boolean;
  /** false for a value that is only ever auto-filled, e.g. bank name from the IFSC lookup */
  editable?: boolean;
  /** shows a small spinner in place of typing while the value is being auto-filled */
  loading?: boolean;
}) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text
        style={{
          color: "#374151",
          fontSize: 12,
          fontWeight: "700",
          marginBottom: 8,
        }}
      >
        {label}
      </Text>

      <View style={{ justifyContent: "center" }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          keyboardType={keyboardType}
          multiline={multiline}
          editable={editable && !loading}
          style={{
            minHeight: multiline ? 84 : 48,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#E5E7EB",
            backgroundColor: editable ? "#F9FAFB" : "#F1F5F9",
            paddingHorizontal: 14,
            paddingRight: loading ? 40 : 14,
            paddingTop: multiline ? 12 : 0,
            paddingBottom: multiline ? 12 : 0,
            color: editable ? "#111827" : "#64748B",
            fontSize: 14,
            fontWeight: "500",
            textAlignVertical: multiline ? "top" : "center",
          }}
        />

        {loading && (
          <ActivityIndicator
            size="small"
            color="#2563EB"
            style={{ position: "absolute", right: 14 }}
          />
        )}
      </View>
    </View>
  );
}
