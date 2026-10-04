import React, { useCallback, useEffect, useState } from "react";
import {
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
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  EmptyState,
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
 * REGISTRATION REQUESTS
 * ============================================================
 *
 * People who signed up and are waiting to be let in. The decision
 * goes to PATCH /api/hr/pending-requests/:id?status=approve or
 * reject, which flips the account to Active or Rejected.
 */
interface Request {
  _id: string;
  id?: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  designation?: string;
  role?: string;
  status?: string;
  createdAt?: string;
}

const ROLE_STYLE: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  ADMIN: { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" },
  HR: { bg: "#F5F3FF", border: "#DDD6FE", text: "#6D28D9" },
  EMPLOYEE: { bg: "#EFF6FF", border: "#DBEAFE", text: "#1D4ED8" },
};

export default function HrRequestsScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Request | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        "/api/hr/pending-requests?status=Pending",
        session.token
      );

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Requests Unavailable",
          message: "Could not load the signup queue.",
        });

        return;
      }

      const data = await res.json();
      setRequests(Array.isArray(data) ? data : data?.requests || []);
    } catch (error) {
      console.error("HR requests error:", error);

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

  const settle = async (request: Request, action: "approve" | "reject") => {
    if (saving) return;

    setSaving(true);

    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/hr/pending-requests/${request._id}?status=${action}`,
        session.token,
        { method: "PATCH" }
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

      showToast({
        type: action === "approve" ? "success" : "info",
        title: action === "approve" ? "Account Approved" : "Request Rejected",
        message: `${request.name} has been ${
          action === "approve" ? "let in" : "turned down"
        }.`,
      });

      load();
    } catch (error) {
      console.error("Settle request error:", error);

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
        <SectionTitle>
          {requests.length} waiting for a decision
        </SectionTitle>

        {loading ? (
          <Loading label="Loading requests" />
        ) : requests.length === 0 ? (
          <EmptyState
            icon="person-add-outline"
            title="Queue is empty"
            message="Nobody is waiting for their account to be approved."
          />
        ) : (
          requests.map((request) => (
            <Card key={request._id} onPress={() => setOpen(request)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: "#F5F3FF",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#7C3AED",
                      fontSize: 17,
                      fontWeight: "800",
                    }}
                  >
                    {(request.name || "?").charAt(0).toUpperCase()}
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
                    {request.name}
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
                    {request.email}
                  </Text>
                </View>

                <StatusPill status={request.status || "Pending"} />
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
                numberOfLines={1}
              >
                Signup request
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
                {/* WHO SIGNED UP */}

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
                      {(open.name || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginHorizontal: 14 }}>
                    <Text
                      style={{
                        color: "#111827",
                        fontSize: 17,
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {open.name}
                    </Text>

                    <Text
                      style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                      numberOfLines={1}
                    >
                      {open.email}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 10,
                      backgroundColor: (
                        ROLE_STYLE[open.role || "EMPLOYEE"] ||
                        ROLE_STYLE.EMPLOYEE
                      ).bg,
                      borderWidth: 1,
                      borderColor: (
                        ROLE_STYLE[open.role || "EMPLOYEE"] ||
                        ROLE_STYLE.EMPLOYEE
                      ).border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: (
                          ROLE_STYLE[open.role || "EMPLOYEE"] ||
                          ROLE_STYLE.EMPLOYEE
                        ).text,
                      }}
                    >
                      {open.role || "EMPLOYEE"}
                    </Text>
                  </View>
                </View>

                {/* THE REST, label on the left, value on the right */}

                <Card>
                  <Row label="Phone number" value={open.phone} />
                  <Row label="Employee ID" value={open.id} />
                  <Row label="Department" value={open.department} />
                  <Row label="Designation" value={open.designation} />
                  <Row
                    label="Signed up"
                    value={formatDate(open.createdAt)}
                    last
                  />
                </Card>

                <View style={{ flexDirection: "row", marginTop: 10 }}>
                  <PrimaryButton
                    label="Reject"
                    icon="close"
                    onPress={() => settle(open, "reject")}
                    busy={saving}
                    tone="red"
                    style={{ flex: 1, marginRight: 8 }}
                  />

                  <PrimaryButton
                    label="Approve"
                    icon="checkmark"
                    onPress={() => settle(open, "approve")}
                    busy={saving}
                    tone="green"
                    style={{ flex: 1, marginLeft: 8 }}
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
