import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Card,
  EmptyState,
  Loading,
  Row,
  SectionTitle,
  StatusPill,
  formatDate,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * EMPLOYEE DIRECTORY
 * ============================================================
 *
 * GET /api/hr/employees, filtered by status and searched by the
 * same query the web console sends. HR reads the records here;
 * changing them stays with the admin console.
 */
interface Employee {
  _id: string;
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department?: string;
  designation?: string;
  profileImage?: string;
  avatar?: string;
  phone?: string;
  address?: string;
  projectStatus?: string;
  joiningDate?: string;
  dob?: string;
  bloodGroup?: string;
  uan?: string;
  emergencyContact?: { name: string; phone: string };
}

const STATUS_FILTERS = ["All", "Active", "Pending", "Inactive"];
const ROLE_FILTERS = ["All", "EMPLOYEE", "HR", "ADMIN"];
const PROJECT_FILTERS = ["All", "In Project", "Bench", "Training"];
const SORTS = ["Newest", "Name", "Department"];

const ROLE_STYLE: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  ADMIN: { bg: "#FEF2F2", border: "#FECACA", text: "#B91C1C" },
  HR: { bg: "#F5F3FF", border: "#DDD6FE", text: "#6D28D9" },
  EMPLOYEE: { bg: "#EFF6FF", border: "#DBEAFE", text: "#1D4ED8" },
};

/** green while the account is live, amber pending, red otherwise */
const statusDot = (status: string) => {
  if (status === "Active") return "#10B981";
  if (status === "Pending") return "#F59E0B";

  return "#EF4444";
};

export default function HrEmployeesScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop();
  const { showToast } = useToast();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [status, setStatus] = useState("Active");
  const [role, setRole] = useState("All");
  const [project, setProject] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("Newest");
  const [open, setOpen] = useState<Employee | null>(null);

  /** a long press on the header title opens the search field */
  useShellSearch(setSearch);

  /** every filter and the sort live in the three dot menu */
  useShellFilters([
    {
      key: "status",
      label: "Status",
      value: status,
      defaultValue: "Active",
      options: toShellOptions(STATUS_FILTERS),
      onChange: setStatus,
    },
    {
      key: "role",
      label: "Role",
      value: role,
      defaultValue: "All",
      options: toShellOptions(ROLE_FILTERS),
      onChange: setRole,
    },
    {
      key: "project",
      label: "Project",
      value: project,
      defaultValue: "All",
      options: toShellOptions(PROJECT_FILTERS),
      onChange: setProject,
    },
    {
      key: "sort",
      label: "Sort by",
      value: sort,
      defaultValue: "Newest",
      options: toShellOptions(SORTS),
      onChange: setSort,
    },
  ]);

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const params = new URLSearchParams();
      if (status !== "All") params.append("status", status);
      if (role !== "All") params.append("role", role);
      if (project !== "All") params.append("project", project);
      if (search.trim()) params.append("search", search.trim());

      const query = params.toString();

      const res = await apiFetch(
        `/api/hr/employees${query ? `?${query}` : ""}`,
        session.token
      );

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Directory Unavailable",
          message: "Could not load the employee list.",
        });

        return;
      }

      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("HR employees error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status, role, project]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  /** the server returns newest first, the rest is ordered here */
  const sorted = useMemo(() => {
    const list = [...employees];

    if (sort === "Name") {
      return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    if (sort === "Department") {
      return list.sort((a, b) =>
        (a.department || "zzz").localeCompare(b.department || "zzz")
      );
    }

    return list;
  }, [employees, sort]);

  /** typing settles before the list is asked again */
  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <>
      <ScrollView
        {...shellScroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          {employees.length} {employees.length === 1 ? "person" : "people"}
          {search ? ` matching "${search}"` : ""}
        </SectionTitle>

        {loading ? (
          <Loading label="Loading employees" />
        ) : employees.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="Nobody found"
            message="No employee matches this search and filter."
          />
        ) : (
          sorted.map((employee) => {
            const role = ROLE_STYLE[employee.role] || ROLE_STYLE.EMPLOYEE;

            const photo = employee.profileImage || employee.avatar;

            return (
              <TouchableOpacity
                key={employee._id}
                activeOpacity={0.7}
                onPress={() => setOpen(employee)}
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
                {/* PHOTO, with a dot for the account status */}

                <View style={{ position: "relative", marginRight: 14 }}>
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
                        {(employee.name || "?").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: statusDot(employee.status),
                      borderWidth: 2,
                      borderColor: "#FFFFFF",
                    }}
                  />
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
                    {employee.name}
                  </Text>

                  <Text
                    style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }}
                    numberOfLines={1}
                  >
                    {employee.email}
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 10,
                    backgroundColor: role.bg,
                    borderWidth: 1,
                    borderColor: role.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "800",
                      color: role.text,
                    }}
                  >
                    {employee.role}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ============================================================
          ONE EMPLOYEE IN FULL
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
                {open?.name}
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
                {/* PROFILE, the way the admin sheet opens */}

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
                  <View style={{ position: "relative", marginRight: 16 }}>
                    {open.profileImage || open.avatar ? (
                      <Image
                        source={{
                          uri: open.profileImage || open.avatar,
                        }}
                        style={{ width: 64, height: 64, borderRadius: 32 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 32,
                          backgroundColor: "#2563EB",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "#FFFFFF",
                            fontSize: 24,
                            fontWeight: "700",
                          }}
                        >
                          {(open.name || "?").charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View
                      style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: statusDot(open.status),
                        borderWidth: 3,
                        borderColor: "#F9FAFB",
                      }}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: "#111827",
                        fontSize: 18,
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {open.name}
                    </Text>

                    <Text
                      style={{
                        color: "#6B7280",
                        fontSize: 12,
                        marginTop: 3,
                      }}
                      numberOfLines={1}
                    >
                      {open.email}
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 8,
                        gap: 6,
                      }}
                    >
                      <View
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          backgroundColor: (
                            ROLE_STYLE[open.role] || ROLE_STYLE.EMPLOYEE
                          ).bg,
                          borderWidth: 1,
                          borderColor: (
                            ROLE_STYLE[open.role] || ROLE_STYLE.EMPLOYEE
                          ).border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "800",
                            color: (
                              ROLE_STYLE[open.role] || ROLE_STYLE.EMPLOYEE
                            ).text,
                          }}
                        >
                          {open.role}
                        </Text>
                      </View>

                      <StatusPill status={open.status} />
                    </View>
                  </View>
                </View>

                <SectionTitle>Company details</SectionTitle>

                <Card>
                  <Row label="Employee ID" value={open.id} />
                  <Row label="Department" value={open.department} />
                  <Row label="Designation" value={open.designation} />
                  <Row label="Project status" value={open.projectStatus} />
                  <Row
                    label="Joining date"
                    value={formatDate(open.joiningDate)}
                    last
                  />
                </Card>

                <SectionTitle>Personal details</SectionTitle>

                <Card>
                  <Row label="Date of birth" value={formatDate(open.dob)} />
                  <Row label="Blood group" value={open.bloodGroup} />
                  <Row label="UAN number" value={open.uan} last />
                </Card>

                <SectionTitle>Contact</SectionTitle>

                <Card>
                  <Row label="Phone" value={open.phone} />
                  <Row label="Address" value={open.address} />
                  <Row
                    label="Emergency contact"
                    value={
                      open.emergencyContact?.name
                        ? `${open.emergencyContact.name}  ${
                            open.emergencyContact.phone || ""
                          }`.trim()
                        : undefined
                    }
                    last
                  />
                </Card>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
