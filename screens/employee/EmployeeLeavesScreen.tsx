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
  DateField,
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
 * MY LEAVES
 * ============================================================
 *
 * Reads GET /api/employee/leaves and applies through POST on the
 * same path, matching the web page. The reason can be expanded
 * from a short note by /api/ai/generate-leave, the same helper
 * the web form offers.
 */
interface Leave {
  _id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  appliedOn?: string;
  rejectionReason?: string;
}

const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Unpaid"];

/**
 * HR applies for leave through the shared /api/leaves routes, so
 * the paths are props rather than constants.
 */
interface Props {
  listPath?: string;
  createPath?: string;
}

export default function EmployeeLeavesScreen({
  listPath = "/api/employee/leaves",
  createPath = "/api/employee/leaves",
}: Props = {}) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [open, setOpen] = useState<Leave | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({
    type: "Annual",
    reason: "",
    startDate: "",
    endDate: "",
  });

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(listPath, session.token);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Leaves Unavailable",
          message: "Could not load your leave history.",
        });

        return;
      }

      const data = await res.json();
      setLeaves(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Leaves load error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listPath]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = () => {
    setForm({ type: "Annual", reason: "", startDate: "", endDate: "" });
    setFormOpen(true);
  };

  /** the header menu Apply row lands here */
  useRegisterScreenAction("applyLeave", openForm);

  const expandReason = async () => {
    if (!form.reason.trim() || generating) return;

    setGenerating(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch("/api/ai/generate-leave", session.token, {
        method: "POST",
        body: JSON.stringify({ reason: form.reason }),
      });

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
        data.reason || data.text || data.result || data.message || "";

      if (text) setForm((f) => ({ ...f, reason: text }));
    } catch (error) {
      console.error("Generate leave reason error:", error);
    } finally {
      setGenerating(false);
    }
  };

  const submit = async () => {
    if (saving) return;

    if (!form.startDate.trim() || !form.endDate.trim()) {
      showToast({
        type: "error",
        title: "Dates Required",
        message: "Enter both the start and the end date.",
      });

      return;
    }

    if (!form.reason.trim()) {
      showToast({
        type: "error",
        title: "Reason Required",
        message: "Say why you need the leave.",
      });

      return;
    }

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(createPath, session.token, {
        method: "POST",
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Not Submitted",
          message: data?.message || "Your request was not accepted.",
        });

        return;
      }

      setFormOpen(false);

      showToast({
        type: "success",
        title: "Leave Requested",
        message: "Your request is now waiting for approval.",
      });

      load();
    } catch (error) {
      console.error("Apply leave error:", error);

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
        <SectionTitle>My requests</SectionTitle>

        {loading ? (
          <Loading label="Loading leaves" />
        ) : leaves.length === 0 ? (
          <EmptyState
            icon="airplane-outline"
            title="No leave yet"
            message="Requests you submit will be listed here with their status."
          />
        ) : (
          /* the row stays to the point, the detail opens on tap */
          leaves.map((leave) => (
            <Card key={leave._id} onPress={() => setOpen(leave)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconTile
                  icon="calendar-outline"
                  tone={
                    leave.status === "Approved"
                      ? "green"
                      : leave.status === "Rejected"
                      ? "red"
                      : "amber"
                  }
                />

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: "800",
                    }}
                  >
                    {leave.type} leave
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 3,
                    }}
                  >
                    {formatDate(leave.startDate)} to{" "}
                    {formatDate(leave.endDate)}
                  </Text>
                </View>

                <StatusPill status={leave.status} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* ============================================================
          ONE REQUEST IN FULL
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
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 20,
                  fontWeight: "800",
                }}
              >
                {open?.type} leave
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
                    marginBottom: 14,
                  }}
                >
                  <StatusPill status={open.status} />

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginLeft: 10,
                    }}
                  >
                    {formatDate(open.startDate)} to {formatDate(open.endDate)}
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
                  Reason
                </Text>

                <Text
                  style={{
                    color: "#475569",
                    fontSize: 13,
                    lineHeight: 20,
                  }}
                >
                  {open.reason}
                </Text>

                {!!open.rejectionReason && (
                  <View
                    style={{
                      marginTop: 18,
                      padding: 14,
                      borderRadius: 16,
                      backgroundColor: "#FEF2F2",
                    }}
                  >
                    <Text
                      style={{
                        color: "#B91C1C",
                        fontSize: 11,
                        fontWeight: "800",
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        marginBottom: 5,
                      }}
                    >
                      Why it was rejected
                    </Text>

                    <Text
                      style={{
                        color: "#991B1B",
                        fontSize: 13,
                        lineHeight: 19,
                      }}
                    >
                      {open.rejectionReason}
                    </Text>
                  </View>
                )}

                {!!open.appliedOn && (
                  <Text
                    style={{
                      color: "#CBD5E1",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 18,
                    }}
                  >
                    Applied on {formatDate(open.appliedOn)}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ============================================================
          APPLY FOR LEAVE
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
                Apply for leave
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
              <FormLabel>Leave type</FormLabel>

              <View
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {LEAVE_TYPES.map((type) => {
                  const active = form.type === type;

                  return (
                    <TouchableOpacity
                      key={type}
                      activeOpacity={0.8}
                      onPress={() => setForm((f) => ({ ...f, type }))}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: active ? "#2563EB" : "#E5E7EB",
                        backgroundColor: active ? "#2563EB" : "#F9FAFB",
                      }}
                    >
                      <Text
                        style={{
                          color: active ? "#FFFFFF" : "#374151",
                          fontSize: 12,
                          fontWeight: active ? "800" : "600",
                        }}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <DateField
                label="Start date"
                value={form.startDate}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    startDate: v,
                    /** an end before the new start makes no sense */
                    endDate: f.endDate && f.endDate < v ? v : f.endDate,
                  }))
                }
              />

              <DateField
                label="End date"
                value={form.endDate}
                minimumDate={
                  form.startDate ? new Date(form.startDate) : undefined
                }
                onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
              />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 16,
                }}
              >
                <Text
                  style={{
                    color: "#374151",
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  Reason
                </Text>

                <TouchableOpacity
                  onPress={expandReason}
                  disabled={generating || !form.reason.trim()}
                  activeOpacity={0.7}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Ionicons
                    name="sparkles-outline"
                    size={14}
                    color={form.reason.trim() ? "#7C3AED" : "#CBD5E1"}
                  />

                  <Text
                    style={{
                      color: form.reason.trim() ? "#7C3AED" : "#CBD5E1",
                      fontSize: 11,
                      fontWeight: "800",
                      marginLeft: 5,
                    }}
                  >
                    {generating ? "Writing" : "Improve with AI"}
                  </Text>
                </TouchableOpacity>
              </View>

              <FormInput
                value={form.reason}
                placeholder="A short note is enough, AI can expand it"
                multiline
                onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
                style={{ marginTop: 6 }}
              />

              <PrimaryButton
                label="Submit request"
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

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: "#374151",
        fontSize: 12,
        fontWeight: "700",
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function FormInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: any;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      multiline={multiline}
      style={[
        {
          minHeight: multiline ? 96 : 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          backgroundColor: "#F9FAFB",
          paddingHorizontal: 14,
          paddingTop: multiline ? 12 : 0,
          paddingBottom: multiline ? 12 : 0,
          color: "#111827",
          fontSize: 14,
          fontWeight: "500",
          textAlignVertical: multiline ? "top" : "center",
        },
        style,
      ]}
    />
  );
}
