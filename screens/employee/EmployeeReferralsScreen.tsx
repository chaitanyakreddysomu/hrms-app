import React, { useCallback, useEffect, useState } from "react";
import {
  Linking,
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
import * as DocumentPicker from "expo-document-picker";

import { getAuthSession } from "../../utils/authStorage";
import { API_BASE_URL, apiFetch } from "../../utils/api";
import {
  useRegisterScreenAction,
  useShellScroll,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  EmptyState,
  IconTile,
  Loading,
  PrimaryButton,
  Row,
  SectionTitle,
  StatusPill,
  formatDate,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * MY REFERRALS
 * ============================================================
 *
 * Lists GET /api/referrals/my and submits to POST /api/referrals.
 * A resume is uploaded first through /api/referrals/upload, which
 * answers with the stored URL to attach, exactly as on the web.
 */
interface Referral {
  _id: string;
  candidateName: string;
  email?: string;
  phone?: string;
  role?: string;
  location?: string;
  currentCompany?: string;
  status?: string;
  resumeUrl?: string;
  createdAt?: string;
}

const BLANK = {
  candidateName: "",
  email: "",
  phone: "",
  role: "",
  location: "",
  currentCompany: "",
};

export default function EmployeeReferralsScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [open, setOpen] = useState<Referral | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [resume, setResume] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/referrals/my", session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Referrals Unavailable",
          message: "Could not load your referrals.",
        });

        return;
      }

      const data = await res.json();
      setReferrals(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Referrals load error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = () => {
    setForm({ ...BLANK });
    setResume(null);
    setFormOpen(true);
  };

  useRegisterScreenAction("addReferral", openForm);

  const pickResume = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "application/msword"],
      copyToCacheDirectory: true,
    });

    if (!picked.canceled) setResume(picked.assets[0]);
  };

  const submit = async () => {
    if (saving) return;

    if (!form.candidateName.trim()) {
      showToast({
        type: "error",
        title: "Name Required",
        message: "Enter the candidate name.",
      });

      return;
    }

    if (!form.email.trim()) {
      showToast({
        type: "error",
        title: "Email Required",
        message: "Enter the candidate email address.",
      });

      return;
    }

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      let resumeUrl = "";

      /* the file goes up first, the record carries its URL */
      if (resume) {
        const upload = new FormData();

        upload.append("document", {
          uri: resume.uri,
          name: resume.name,
          type: resume.mimeType || "application/pdf",
        } as any);

        const uploadRes = await fetch(
          `${API_BASE_URL}/api/referrals/upload`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${session.token}` },
            body: upload,
          }
        );

        const uploadData = await uploadRes.json().catch(() => null);

        if (!uploadRes.ok || !uploadData?.resumeUrl) {
          showToast({
            type: "error",
            title: "Resume Upload Failed",
            message: uploadData?.message || "The file was not accepted.",
          });

          return;
        }

        resumeUrl = uploadData.resumeUrl;
      }

      const res = await apiFetch("/api/referrals", session.token, {
        method: "POST",
        body: JSON.stringify({ ...form, resumeUrl }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Not Submitted",
          message: data?.message || "Your referral was not accepted.",
        });

        return;
      }

      setFormOpen(false);

      showToast({
        type: "success",
        title: "Referral Sent",
        message: `${form.candidateName} has been referred.`,
      });

      load();
    } catch (error) {
      console.error("Create referral error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScrollView
        {...shellScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: shellTop, paddingBottom: 150 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#2563EB"
          />
        }
      >
        <SectionTitle>My candidates</SectionTitle>

        {loading ? (
          <Loading label="Loading referrals" />
        ) : referrals.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No referrals yet"
            message="Refer someone you would work with and track their progress here."
          />
        ) : (
          /* the row carries the name and the outcome, the rest opens on tap */
          referrals.map((referral) => (
            <Card key={referral._id} onPress={() => setOpen(referral)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: "#EFF6FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#2563EB",
                      fontSize: 17,
                      fontWeight: "800",
                    }}
                  >
                    {referral.candidateName.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: "800",
                    }}
                    numberOfLines={1}
                  >
                    {referral.candidateName}
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 3,
                    }}
                    numberOfLines={1}
                  >
                    {referral.role || "Role not set"}
                    {referral.currentCompany
                      ? `  ${referral.currentCompany}`
                      : ""}
                  </Text>
                </View>

                <StatusPill status={referral.status || "Under Review"} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* ============================================================
          ONE CANDIDATE IN FULL
      ============================================================ */}

      <Modal
        visible={!!open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(null)} />

          <View
            style={{
              maxHeight: "80%",
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 34,
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
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 20,
                  fontWeight: "800",
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {open?.candidateName}
              </Text>

              <TouchableOpacity
                onPress={() => setOpen(null)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: 10,
                }}
              >
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {!!open && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ marginBottom: 6 }}>
                  <StatusPill status={open.status || "Under Review"} />
                </View>

                <Card>
                  <Row label="Email" value={open.email} />
                  <Row label="Phone" value={open.phone} />
                  <Row label="Role" value={open.role} />
                  <Row label="Current company" value={open.currentCompany} />
                  <Row label="Location" value={open.location} />
                  <Row
                    label="Referred on"
                    value={formatDate(open.createdAt)}
                    last
                  />
                </Card>

                {!!open.resumeUrl && (
                  <PrimaryButton
                    label="Open resume"
                    icon="document-text-outline"
                    onPress={() => Linking.openURL(open.resumeUrl!)}
                    style={{ marginTop: 6 }}
                  />
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ============================================================
          REFER A CANDIDATE
      ============================================================ */}

      <Modal
        visible={formOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setFormOpen(false)}
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
            onPress={() => !saving && setFormOpen(false)}
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
                Refer a candidate
              </Text>

              <TouchableOpacity
                onPress={() => !saving && setFormOpen(false)}
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
              <Field
                label="Candidate name"
                value={form.candidateName}
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, candidateName: v }))
                }
              />

              <Field
                label="Email"
                value={form.email}
                keyboardType="email-address"
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
              />

              <Field
                label="Phone"
                value={form.phone}
                keyboardType="phone-pad"
                onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
              />

              <Field
                label="Role applied for"
                value={form.role}
                onChangeText={(v) => setForm((f) => ({ ...f, role: v }))}
              />

              <Field
                label="Current company"
                value={form.currentCompany}
                onChangeText={(v) =>
                  setForm((f) => ({ ...f, currentCompany: v }))
                }
              />

              <Field
                label="Location"
                value={form.location}
                onChangeText={(v) => setForm((f) => ({ ...f, location: v }))}
              />

              {/* RESUME */}

              <Text
                style={{
                  color: "#374151",
                  fontSize: 12,
                  fontWeight: "700",
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                Resume
              </Text>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={pickResume}
                style={{
                  height: 52,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: resume ? "#2563EB" : "#CBD5E1",
                  backgroundColor: resume ? "#EFF6FF" : "#F9FAFB",
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                }}
              >
                <Ionicons
                  name={resume ? "document-text" : "cloud-upload-outline"}
                  size={18}
                  color={resume ? "#2563EB" : "#94A3B8"}
                />

                <Text
                  style={{
                    color: resume ? "#2563EB" : "#94A3B8",
                    fontSize: 12,
                    fontWeight: "700",
                    marginLeft: 10,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {resume ? resume.name : "Attach a PDF resume, optional"}
                </Text>

                {!!resume && (
                  <TouchableOpacity
                    onPress={() => setResume(null)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={16} color="#2563EB" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              <PrimaryButton
                label="Submit referral"
                icon="paper-plane-outline"
                onPress={submit}
                busy={saving}
                style={{ marginTop: 24, marginBottom: 12 }}
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
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "email-address" | "phone-pad";
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

      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={
          keyboardType === "email-address" ? "none" : "sentences"
        }
        style={{
          height: 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          backgroundColor: "#F9FAFB",
          paddingHorizontal: 14,
          color: "#111827",
          fontSize: 14,
          fontWeight: "500",
        }}
      />
    </View>
  );
}
