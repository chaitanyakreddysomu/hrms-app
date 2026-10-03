import React, { useCallback, useEffect, useState } from "react";
import {
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

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch } from "../../utils/api";
import {
  toShellOptions,
  useShellFilters,
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
  ToneName,
  formatDate,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * LEAVE REQUESTS
 * ============================================================
 *
 * GET /api/hr/leaves lists what employees have asked for, and
 * PUT /api/hr/leaves/:id settles it. A rejection carries a
 * reason, which the employee sees on their own leave card.
 */
interface Leave {
  _id: string;
  userId?: string;
  name?: string;
  userName?: string;
  email?: string;
  profileImage?: string;
  avatar?: string;
  type: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  appliedOn?: string;
  rejectionReason?: string;
}

const FILTERS = ["All", "Pending", "Approved", "Rejected"];

const STATUS_THEME: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  Approved: { bg: "#ECFDF5", border: "#A7F3D0", text: "#047857" },
  Rejected: { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" },
  Pending: { bg: "#FFFBEB", border: "#FDE68A", text: "#B45309" },
};

/** inclusive, so a single day request reads as 1 day */
const spanOf = (leave: { startDate?: string; endDate?: string }) => {
  if (!leave.startDate || !leave.endDate) return "--";

  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "--";
  }

  const days =
    Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

  return days === 1 ? "1 day" : `${days} days`;
};

export default function HrLeavesScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [status, setStatus] = useState("All");
  const [open, setOpen] = useState<Leave | null>(null);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  /** the header menu owns the filter, as it does on the admin list */
  useShellFilters([
    {
      key: "status",
      label: "Status",
      value: status,
      defaultValue: "All",
      options: toShellOptions(FILTERS),
      onChange: setStatus,
    },
  ]);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/hr/leaves?status=${status}`,
        session.token
      );

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Requests Unavailable",
          message: "Could not load leave requests.",
        });

        return;
      }

      const data = await res.json();
      setLeaves(Array.isArray(data) ? data : data?.leaves || []);
    } catch (error) {
      console.error("HR leaves error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const settle = async (leave: Leave, next: "Approved" | "Rejected") => {
    if (saving) return;

    if (next === "Rejected" && !reason.trim()) {
      showToast({
        type: "error",
        title: "Reason Required",
        message: "Tell the employee why it was rejected.",
      });

      return;
    }

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/hr/leaves/${leave._id}`,
        session.token,
        {
          method: "PUT",
          body: JSON.stringify({
            status: next,
            rejectionReason: next === "Rejected" ? reason.trim() : undefined,
          }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Not Saved",
          message: data?.message || "The decision was not accepted.",
        });

        return;
      }

      setOpen(null);
      setRejecting(false);
      setReason("");

      showToast({
        type: next === "Approved" ? "success" : "info",
        title: next === "Approved" ? "Leave Approved" : "Leave Rejected",
        message: `${leave.name || "The employee"} has been notified.`,
      });

      load();
    } catch (error) {
      console.error("Settle leave error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setSaving(false);
    }
  };

  const closeSheet = () => {
    if (saving) return;

    setOpen(null);
    setRejecting(false);
    setReason("");
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
        <SectionTitle>
          {leaves.length} {leaves.length === 1 ? "request" : "requests"}
        </SectionTitle>

        {loading ? (
          <Loading label="Loading requests" />
        ) : leaves.length === 0 ? (
          <EmptyState
            icon="airplane-outline"
            title="Nothing here"
            message="No leave request matches this filter right now." 
          />
        ) : (
          leaves.map((leave) => {
            const theme = STATUS_THEME[leave.status] || STATUS_THEME.Pending;

            const photo = leave.profileImage || leave.avatar;

            const who = leave.userName || leave.name || leave.userId;

            return (
              <TouchableOpacity
                key={leave._id}
                activeOpacity={0.7}
                onPress={() => setOpen(leave)}
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 20,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#F3F4F6",
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <View style={{ marginRight: 14 }}>
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: "#F3F4F6",
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        backgroundColor: "#EFF6FF",
                        borderWidth: 1,
                        borderColor: "#DBEAFE",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#2563EB",
                          fontSize: 18,
                          fontWeight: "700",
                        }}
                      >
                        {(who || "?").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text
                    style={{
                      color: "#111827",
                      fontWeight: "700",
                      fontSize: 15,
                    }}
                    numberOfLines={1}
                  >
                    {who || "Unknown"}
                  </Text>

                  <Text
                    style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                    numberOfLines={1}
                  >
                    {leave.type} · {formatDate(leave.appliedOn || leave.startDate)}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: theme.bg,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: theme.text,
                    }}
                  >
                    {leave.status}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ============================================================
          SETTLE ONE REQUEST
      ============================================================ */}

      <Modal
        visible={!!open}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />

          <View
            style={{
              maxHeight: "86%",
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
                {open?.name || "Leave request"}
              </Text>

              <TouchableOpacity
                onPress={closeSheet}
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
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* WHO ASKED */}

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#F9FAFB",
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 16,
                  }}
                >
                  {open.profileImage || open.avatar ? (
                    <Image
                      source={{ uri: open.profileImage || open.avatar }}
                      style={{ width: 56, height: 56, borderRadius: 28 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        backgroundColor: "#2563EB",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontSize: 22,
                          fontWeight: "700",
                        }}
                      >
                        {(open.userName || open.name || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginHorizontal: 14 }}>
                    <Text
                      style={{
                        color: "#111827",
                        fontSize: 17,
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {open.userName || open.name || open.userId || "Employee"}
                    </Text>

                    <Text
                      style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                      numberOfLines={1}
                    >
                      {open.email || open.userId || "--"}
                    </Text>
                  </View>

                  <StatusPill status={open.status} />
                </View>

                {/* THE REQUEST, two by two */}

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                  }}
                >
                  <Tile
                    icon="pricetag-outline"
                    tone="blue"
                    label="Leave type"
                    value={open.type || "--"}
                  />

                  <Tile
                    icon="hourglass-outline"
                    tone="purple"
                    label="Duration"
                    value={spanOf(open)}
                  />

                  <Tile
                    icon="calendar-outline"
                    tone="green"
                    label="Starts"
                    value={formatDate(open.startDate)}
                  />

                  <Tile
                    icon="calendar-number-outline"
                    tone="amber"
                    label="Ends"
                    value={formatDate(open.endDate)}
                  />
                </View>

                {/* WHY */}

                <Text
                  style={{
                    color: "#94A3B8",
                    fontSize: 11,
                    fontWeight: "800",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginTop: 6,
                    marginBottom: 6,
                  }}
                >
                  Reason given
                </Text>

                <Text
                  style={{ color: "#475569", fontSize: 13, lineHeight: 20 }}
                >
                  {open.reason || "No reason was given."}
                </Text>

                {/* a rejection explains itself, an approval needs nothing */}
                {open.status === "Rejected" && !!open.rejectionReason && (
                  <View
                    style={{
                      marginTop: 16,
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
                      Rejected because
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

                {/* only a pending request can still be settled */}
                {open.status === "Pending" &&
                  (rejecting ? (
                    <>
                      <Text
                        style={{
                          color: "#374151",
                          fontSize: 12,
                          fontWeight: "700",
                          marginTop: 22,
                          marginBottom: 8,
                        }}
                      >
                        Why are you rejecting this?
                      </Text>

                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="The employee will see this"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        autoFocus
                        style={{
                          minHeight: 96,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          backgroundColor: "#F9FAFB",
                          paddingHorizontal: 14,
                          paddingTop: 12,
                          paddingBottom: 12,
                          color: "#111827",
                          fontSize: 14,
                          textAlignVertical: "top",
                        }}
                      />

                      <View style={{ flexDirection: "row", marginTop: 16 }}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            setRejecting(false);
                            setReason("");
                          }}
                          disabled={saving}
                          style={{
                            flex: 1,
                            height: 50,
                            borderRadius: 16,
                            backgroundColor: "#F3F4F6",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 8,
                          }}
                        >
                          <Text
                            style={{
                              color: "#374151",
                              fontSize: 14,
                              fontWeight: "700",
                            }}
                          >
                            Back
                          </Text>
                        </TouchableOpacity>

                        <PrimaryButton
                          label="Reject leave"
                          onPress={() => settle(open, "Rejected")}
                          busy={saving}
                          tone="red"
                          style={{ flex: 1, marginLeft: 8 }}
                        />
                      </View>
                    </>
                  ) : (
                    <View style={{ flexDirection: "row", marginTop: 24 }}>
                      <PrimaryButton
                        label="Reject"
                        icon="close"
                        onPress={() => setRejecting(true)}
                        tone="red"
                        style={{ flex: 1, marginRight: 8 }}
                      />

                      <PrimaryButton
                        label="Approve"
                        icon="checkmark"
                        onPress={() => settle(open, "Approved")}
                        busy={saving}
                        tone="green"
                        style={{ flex: 1, marginLeft: 8 }}
                      />
                    </View>
                  ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

function Tile({
  icon,
  tone,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: ToneName;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        width: "48.5%",
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "#EEF2F7",
        padding: 14,
        marginBottom: 12,
      }}
    >
      <IconTile icon={icon} tone={tone} size={34} />

      <Text
        style={{
          color: "#0F172A",
          fontSize: 15,
          fontWeight: "800",
          marginTop: 10,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>

      <Text
        style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
