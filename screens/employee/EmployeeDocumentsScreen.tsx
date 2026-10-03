import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

import { getAuthSession } from "../../utils/authStorage";
import { API_BASE_URL, apiFetch } from "../../utils/api";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  IconTile,
  Loading,
  SectionTitle,
  StatusPill,
  ToneName,
  formatDate,
} from "./ui";

/**
 * ============================================================
 * MY DOCUMENTS
 * ============================================================
 *
 * The same checklist the web page shows, in the same four
 * categories. What has been uploaded comes from the documents
 * array on GET /api/employee/profile, and a new file goes to
 * POST /api/employee/documents/upload as multipart form data.
 */
interface DocSlot {
  id: string;
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: ToneName;
}

const CATEGORIES: { key: string; label: string; docs: DocSlot[] }[] = [
  {
    key: "Government",
    label: "Government",
    docs: [
      { id: "aadhaar", name: "Aadhaar Card", icon: "card-outline", tone: "blue" },
      { id: "pan", name: "PAN Card", icon: "card-outline", tone: "green" },
      {
        id: "passport",
        name: "Passport",
        icon: "book-outline",
        tone: "purple",
      },
    ],
  },
  {
    key: "Educational",
    label: "Educational",
    docs: [
      {
        id: "10th",
        name: "10th Certificate",
        icon: "school-outline",
        tone: "amber",
      },
      {
        id: "12th",
        name: "12th Certificate",
        icon: "school-outline",
        tone: "amber",
      },
      {
        id: "degree",
        name: "Degree Certificate",
        icon: "ribbon-outline",
        tone: "purple",
      },
    ],
  },
  {
    key: "Personal",
    label: "Personal",
    docs: [
      { id: "photo", name: "Photo", icon: "image-outline", tone: "blue" },
      {
        id: "offer",
        name: "Offer Letter",
        icon: "document-text-outline",
        tone: "green",
      },
      {
        id: "resume",
        name: "Resume",
        icon: "document-attach-outline",
        tone: "slate",
      },
    ],
  },
  {
    key: "Experience",
    label: "Experience",
    docs: [
      {
        id: "training",
        name: "Training Certificates",
        icon: "medal-outline",
        tone: "amber",
      },
    ],
  },
];

interface Props {
  profilePath?: string;
  uploadPath?: string;
  previewPath?: string;
}

export default function EmployeeDocumentsScreen({
  profilePath = "/api/employee/profile",
  uploadPath = "/api/employee/documents/upload",
  previewPath = "/api/employee/documents/preview",
}: Props = {}) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const [category, setCategory] = useState(CATEGORIES[0].key);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(profilePath, session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Documents Unavailable",
          message: "Could not load your uploads.",
        });

        return;
      }

      const data = await res.json();
      setDocs(Array.isArray(data?.documents) ? data.documents : []);
    } catch (error) {
      console.error("Documents load error:", error);

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

  const upload = async (slot: DocSlot) => {
    if (busyDoc) return;

    const picked = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });

    if (picked.canceled) return;

    const file = picked.assets[0];

    setBusyDoc(slot.id);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const form = new FormData();

      form.append("document", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "application/octet-stream",
      } as any);

      form.append("docId", slot.id);
      form.append("name", slot.name);
      form.append("category", category);

      const res = await fetch(
        `${API_BASE_URL}${uploadPath}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.token}` },
          body: form,
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Upload Failed",
          message: data?.message || "The file was not accepted.",
        });

        return;
      }

      showToast({
        type: "success",
        title: "Uploaded",
        message: `${slot.name} is now on file.`,
      });

      load();
    } catch (error) {
      console.error("Document upload error:", error);

      showToast({
        type: "error",
        title: "Upload Failed",
        message: "Could not reach the server.",
      });
    } finally {
      setBusyDoc(null);
    }
  };

  /** the stored path is private, so the server hands back a link */
  const preview = async (path: string) => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `${previewPath}?path=${encodeURIComponent(path)}`,
        session.token
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.url) {
        showToast({
          type: "error",
          title: "Preview Failed",
          message: data?.message || "Could not open this document.",
        });

        return;
      }

      Linking.openURL(data.url);
    } catch (error) {
      console.error("Document preview error:", error);

      showToast({
        type: "error",
        title: "Preview Failed",
        message: "Could not reach the server.",
      });
    }
  };

  const active = CATEGORIES.find((c) => c.key === category) || CATEGORIES[0];

  const uploaded = docs.length;

  const total = CATEGORIES.reduce((sum, c) => sum + c.docs.length, 0);

  return (
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
      {/* PROGRESS */}

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <IconTile icon="folder-open-outline" tone="blue" />

          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text
              style={{ color: "#0F172A", fontSize: 14, fontWeight: "800" }}
            >
              {uploaded} of {total} uploaded
            </Text>

            <Text
              style={{
                color: "#94A3B8",
                fontSize: 11,
                fontWeight: "600",
                marginTop: 3,
              }}
            >
              HR reviews each file after it arrives
            </Text>
          </View>
        </View>

        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: "#F1F5F9",
            marginTop: 14,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              width: `${Math.min(100, (uploaded / total) * 100)}%`,
              height: "100%",
              backgroundColor: "#2563EB",
            }}
          />
        </View>
      </Card>

      {/* CATEGORY */}

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 6,
        }}
      >
        {CATEGORIES.map((item) => {
          const on = item.key === category;

          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.8}
              onPress={() => setCategory(item.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: on ? "#2563EB" : "#EEF2F7",
                backgroundColor: on ? "#2563EB" : "#FFFFFF",
              }}
            >
              <Text
                style={{
                  color: on ? "#FFFFFF" : "#475569",
                  fontSize: 12,
                  fontWeight: on ? "800" : "600",
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionTitle>{active.label} documents</SectionTitle>

      {loading ? (
        <Loading label="Loading documents" />
      ) : (
        active.docs.map((slot) => {
          const stored = docs.find((d) => d.docId === slot.id);
          const busy = busyDoc === slot.id;

          return (
            <Card key={slot.id}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconTile icon={slot.icon} tone={slot.tone} />

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: "800",
                    }}
                  >
                    {slot.name}
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 3,
                    }}
                  >
                    {stored
                      ? `Uploaded ${formatDate(
                          stored.uploadedAt || stored.createdAt
                        )}`
                      : "Not uploaded yet"}
                  </Text>
                </View>

                {stored ? (
                  <StatusPill status={stored.status || "Review"} />
                ) : (
                  <StatusPill status="Pending" />
                )}
              </View>

              <View style={{ flexDirection: "row", marginTop: 14 }}>
                {!!stored?.path && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => preview(stored.path)}
                    style={{
                      flex: 1,
                      height: 42,
                      borderRadius: 14,
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#EEF2F7",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 8,
                    }}
                  >
                    <Ionicons name="eye-outline" size={16} color="#475569" />

                    <Text
                      style={{
                        color: "#475569",
                        fontSize: 12,
                        fontWeight: "700",
                        marginLeft: 7,
                      }}
                    >
                      View
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => upload(slot)}
                  disabled={busy}
                  style={{
                    flex: 1,
                    height: 42,
                    borderRadius: 14,
                    backgroundColor: busy ? "#93B4F7" : "#2563EB",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons
                        name="cloud-upload-outline"
                        size={16}
                        color="#FFFFFF"
                      />

                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 12,
                          fontWeight: "700",
                          marginLeft: 7,
                        }}
                      >
                        {stored ? "Replace" : "Upload"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}
