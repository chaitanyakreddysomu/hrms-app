import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
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
  useShellSearch,
} from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  EmptyState,
  IconTile,
  Loading,
  SectionTitle,
  ToneName,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * EMPLOYEE COMPLAINTS
 * ============================================================
 *
 * What the team has raised, from GET /api/hr/employee-complaints.
 * Marking one resolved or rejected goes to PATCH on the same
 * resource with the new status.
 */
interface Complaint {
  _id: string;
  subject: string;
  description: string;
  status?: string;
  name?: string;
  userName?: string;
  email?: string;
  empId?: string;
  department?: string;
  profileImage?: string;
  avatar?: string;
  userId?: string;
  createdAt?: string;
  date?: string;
}

const FILTERS = ["All", "Open", "Investigating", "Resolved"];

const STAGES = ["Open", "Investigating", "Resolved"];

/** red while untouched, amber once it is being looked at, green when done */
const statusTheme = (status?: string) => {
  switch (status) {
    case "Resolved":
      return { bg: "#D1FAE5", border: "#A7F3D0", text: "#059669" };
    case "Investigating":
      return { bg: "#FEF3C7", border: "#FDE68A", text: "#D97706" };
    default:
      return { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" };
  }
};

/** Jan 01 2026 */
const longDate = (value?: string | null) => {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

export default function HrComplaintsScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [status, setStatus] = useState("All");
  const [open, setOpen] = useState<Complaint | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  /** a long press on the header title opens the search field */
  useShellSearch(setSearch);

  /** the header menu owns the filter, as it does on the admin lists */
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

      const params = new URLSearchParams();
      if (status !== "All") params.append("status", status);

      const res = await apiFetch(
        `/api/hr/employee-complaints?${params.toString()}`,
        session.token
      );

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Complaints Unavailable",
          message: "Could not load employee complaints.",
        });

        return;
      }

      const data = await res.json();
      setComplaints(Array.isArray(data) ? data : data?.complaints || []);
    } catch (error) {
      console.error("HR complaints error:", error);

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

  const settle = async (complaint: Complaint, next: string) => {
    if (saving) return;

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/hr/employee-complaints/${complaint._id}`,
        session.token,
        {
          method: "PATCH",
          body: JSON.stringify({ status: next }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Not Saved",
          message: data?.message || "The status was not accepted.",
        });

        return;
      }

      setOpen(null);

      showToast({
        type: next === "Resolved" ? "success" : "info",
        title: `Marked ${next}`,
        message: "The employee can see the change.",
      });

      load();
    } catch (error) {
      console.error("Settle complaint error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setSaving(false);
    }
  };

  /** the search narrows what the filter already returned */
  const shown = complaints.filter((complaint) => {
    const text = search.trim().toLowerCase();
    if (!text) return true;

    return [complaint.subject, complaint.description, complaint.name]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(text));
  });

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
        <SectionTitle>
          {shown.length} {shown.length === 1 ? "complaint" : "complaints"}
        </SectionTitle>

        {loading ? (
          <Loading label="Loading complaints" />
        ) : shown.length === 0 ? (
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="Nothing here"
            message="No complaint matches this filter right now." 
          />
        ) : (
          shown.map((complaint) => {
            const theme = statusTheme(complaint.status);

            const photo = complaint.profileImage || complaint.avatar;

            const who =
              complaint.userName || complaint.name || complaint.userId;

            return (
              <TouchableOpacity
                key={complaint._id}
                activeOpacity={0.7}
                onPress={() => setOpen(complaint)}
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
                      backgroundColor: theme.bg,
                      borderWidth: 1,
                      borderColor: theme.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 18,
                        fontWeight: "700",
                      }}
                    >
                      {(who || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1, marginHorizontal: 14 }}>
                  <Text
                    style={{
                      color: "#111827",
                      fontWeight: "700",
                      fontSize: 15,
                    }}
                    numberOfLines={1}
                  >
                    {who || "Employee"}
                  </Text>

                  <Text
                    style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                    numberOfLines={1}
                  >
                    {longDate(complaint.date || complaint.createdAt)}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 10,
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
                    {complaint.status || "Open"}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ============================================================
          ONE COMPLAINT IN FULL
      ============================================================ */}

      <Modal
        visible={!!open}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setOpen(null)}
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
            onPress={() => !saving && setOpen(null)}
          />

          <View
            style={{
              maxHeight: "84%",
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
                onPress={() => !saving && setOpen(null)}
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
                {/* WHO RAISED IT */}

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
                        backgroundColor: statusTheme(open.status).bg,
                        borderWidth: 1,
                        borderColor: statusTheme(open.status).border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: statusTheme(open.status).text,
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
                      {open.userName || open.name || "Employee"}
                    </Text>

                    <Text
                      style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                      numberOfLines={1}
                    >
                      {open.empId || open.userId || "--"}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 10,
                      backgroundColor: statusTheme(open.status).bg,
                      borderWidth: 1,
                      borderColor: statusTheme(open.status).border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: statusTheme(open.status).text,
                      }}
                    >
                      {open.status || "Open"}
                    </Text>
                  </View>
                </View>

                {/* WHERE AND WHEN */}

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Tile
                    icon="business-outline"
                    tone="blue"
                    label="Department"
                    value={open.department || "--"}
                  />

                  <Tile
                    icon="calendar-outline"
                    tone="purple"
                    label="Date filed"
                    value={longDate(open.date || open.createdAt)}
                  />
                </View>

                {/* WHAT IT IS ABOUT */}

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
                  Subject
                </Text>

                <Text
                  style={{
                    color: "#0F172A",
                    fontSize: 15,
                    fontWeight: "800",
                    lineHeight: 21,
                  }}
                >
                  {open.subject}
                </Text>

                <Text
                  style={{
                    color: "#94A3B8",
                    fontSize: 11,
                    fontWeight: "800",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginTop: 16,
                    marginBottom: 6,
                  }}
                >
                  Description
                </Text>

                <Text
                  style={{ color: "#475569", fontSize: 13, lineHeight: 20 }}
                >
                  {open.description}
                </Text>

                {/* ONE TAP MOVES IT */}

                <Text
                  style={{
                    color: "#94A3B8",
                    fontSize: 11,
                    fontWeight: "800",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginTop: 20,
                    marginBottom: 8,
                  }}
                >
                  Update status
                </Text>

                <View style={{ flexDirection: "row", marginBottom: 8 }}>
                  {STAGES.map((stage, index) => {
                    const theme = statusTheme(stage);
                    const current = (open.status || "Open") === stage;

                    return (
                      <TouchableOpacity
                        key={stage}
                        activeOpacity={0.85}
                        onPress={() => settle(open, stage)}
                        disabled={saving || current}
                        style={{
                          flex: 1,
                          height: 46,
                          borderRadius: 14,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          borderColor: current ? theme.text : theme.border,
                          backgroundColor: theme.bg,
                          opacity: current ? 1 : 0.9,
                          marginLeft: index === 0 ? 0 : 8,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 12,
                            fontWeight: "800",
                          }}
                        >
                          {stage}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
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
