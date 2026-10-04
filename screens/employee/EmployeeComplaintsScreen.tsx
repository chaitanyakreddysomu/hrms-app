import React, { useCallback, useEffect, useState } from "react";
import {
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

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
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
  SectionTitle,
  StatusPill,
  formatDate,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * MY COMPLAINTS
 * ============================================================
 *
 * Lists GET /api/employee/complaints and raises new ones on the
 * same path. The description can be drafted from a short note by
 * /api/ai/generate-complaint, as on the web.
 */
interface Complaint {
  _id: string;
  subject: string;
  description: string;
  status?: string;
  /** the model stores it as `date`, older rows may carry createdAt */
  date?: string;
  createdAt?: string;
  response?: string;
}

interface Props {
  /** HR raises its own complaints on a different path */
  path?: string;
}

export default function EmployeeComplaintsScreen({
  path = "/api/employee/complaints",
}: Props = {}) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [open, setOpen] = useState<Complaint | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(path, session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Complaints Unavailable",
          message: "Could not load your complaints.",
        });

        return;
      }

      const data = await res.json();
      setComplaints(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Complaints load error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = () => {
    setSubject("");
    setDescription("");
    setFormOpen(true);
  };

  useRegisterScreenAction("raiseComplaint", openForm);

  const draftDescription = async () => {
    if (!description.trim() || generating) return;

    setGenerating(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        "/api/ai/generate-complaint",
        session.token,
        {
          method: "POST",
          body: JSON.stringify({ complaint: description }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        showToast({
          type: "error",
          title: "Could Not Rewrite",
          message: data?.message || "The assistant is unavailable.",
        });

        return;
      }

      const text =
        data.complaint ||
        data.description ||
        data.text ||
        data.result ||
        "";

      if (text) setDescription(text);
    } catch (error) {
      console.error("Generate complaint error:", error);
    } finally {
      setGenerating(false);
    }
  };

  const submit = async () => {
    if (saving) return;

    if (!subject.trim()) {
      showToast({
        type: "error",
        title: "Subject Required",
        message: "Give your complaint a short subject.",
      });

      return;
    }

    if (!description.trim()) {
      showToast({
        type: "error",
        title: "Details Required",
        message: "Describe what went wrong.",
      });

      return;
    }

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(path, session.token, {
        method: "POST",
        body: JSON.stringify({ subject, description }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Not Submitted",
          message: data?.message || "Your complaint was not accepted.",
        });

        return;
      }

      setFormOpen(false);

      showToast({
        type: "success",
        title: "Complaint Raised",
        message: "HR has been notified and will respond.",
      });

      load();
    } catch (error) {
      console.error("Raise complaint error:", error);

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
        <SectionTitle>My complaints</SectionTitle>

        {loading ? (
          <Loading label="Loading complaints" />
        ) : complaints.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="Nothing raised"
            message="Anything you report to HR will appear here with its status."
          />
        ) : (
          /* the row stays to the point, the detail opens on tap */
          complaints.map((complaint) => (
            <Card key={complaint._id} onPress={() => setOpen(complaint)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconTile
                  icon="chatbubble-ellipses-outline"
                  tone={
                    complaint.status === "Resolved"
                      ? "green"
                      : complaint.status === "Investigating"
                      ? "purple"
                      : "blue"
                  }
                />

                <View style={{ flex: 1, marginHorizontal: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: "800",
                    }}
                    numberOfLines={1}
                  >
                    {complaint.subject}
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 3,
                    }}
                  >
                    {formatDate(complaint.date || complaint.createdAt)}
                  </Text>
                </View>

                <StatusPill status={complaint.status || "Open"} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* ============================================================
          ONE COMPLAINT IN FULL
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
                numberOfLines={2}
              >
                {open?.subject}
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
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <StatusPill status={open.status || "Open"} />

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginLeft: 10,
                    }}
                  >
                    Raised {formatDate(open.date || open.createdAt)}
                  </Text>
                </View>

                <Text
                  style={{
                    color: "#94A3B8",
                    fontSize: 11,
                    fontWeight: "800",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  What you reported
                </Text>

                <Text
                  style={{ color: "#475569", fontSize: 13, lineHeight: 20 }}
                >
                  {open.description}
                </Text>

                {!!open.response && (
                  <View
                    style={{
                      marginTop: 18,
                      padding: 14,
                      borderRadius: 16,
                      backgroundColor: "#F0FDF4",
                    }}
                  >
                    <Text
                      style={{
                        color: "#047857",
                        fontSize: 11,
                        fontWeight: "800",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        marginBottom: 5,
                      }}
                    >
                      HR response
                    </Text>

                    <Text
                      style={{
                        color: "#065F46",
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {open.response}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ============================================================
          RAISE A COMPLAINT
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
                Raise a complaint
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
              <Text
                style={{
                  color: "#374151",
                  fontSize: 12,
                  fontWeight: "700",
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                Subject
              </Text>

              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder="What is this about?"
                placeholderTextColor="#9CA3AF"
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

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 16,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    color: "#374151",
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  Details
                </Text>

                <TouchableOpacity
                  onPress={draftDescription}
                  disabled={generating || !description.trim()}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={14}
                    color={description.trim() ? "#7C3AED" : "#CBD5E1"}
                  />

                  <Text
                    style={{
                      color: description.trim() ? "#7C3AED" : "#CBD5E1",
                      fontSize: 11,
                      fontWeight: "800",
                      marginLeft: 5,
                    }}
                  >
                    {generating ? "Writing" : "Improve with AI"}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="A short note is enough, AI can expand it"
                placeholderTextColor="#9CA3AF"
                multiline
                style={{
                  minHeight: 120,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  backgroundColor: "#F9FAFB",
                  paddingHorizontal: 14,
                  paddingTop: 12,
                  paddingBottom: 12,
                  color: "#111827",
                  fontSize: 14,
                  fontWeight: "500",
                  textAlignVertical: "top",
                }}
              />

              <PrimaryButton
                label="Submit complaint"
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
