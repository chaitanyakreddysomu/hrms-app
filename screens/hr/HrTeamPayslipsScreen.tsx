import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { getAuthSession } from "../../utils/authStorage";
import { apiFetch, resetBaseUrl } from "../../utils/api";
import { useShellFilters, useShellScroll, useShellSearch, toShellOptions } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import ModalDismiss from "../../components/ModalDismiss";

// ─── Types ───────────────────────────────────────────────────────────────────

type PayslipStatus = "Draft" | "Created" | "Paid";

interface Payslip {
  id: string;
  _id?: string;
  empId: string;
  name: string;
  email?: string;
  month: string;
  year: string;
  netPay: number;
  status: PayslipStatus;
  generatedOn?: string;
  basicSalary?: number;
  pf?: number;
  esi?: number;
  pt?: number;
  tds?: number;
  leavesTaken?: number;
  leaveDeduction?: number;
  totalWorkingDays?: number;
  paidDays?: number;
  startDate?: string;
  endDate?: string;
  profileImage?: string;
  avatar?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_OPTIONS = ["All", ...MONTHS];
const STATUS_OPTIONS = ["All", "Draft", "Created", "Paid"];
const THIS_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = ["All", ...Array.from({ length: 5 }, (_, i) => String(THIS_YEAR - i))];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusTheme = (status: string) => {
  switch (status) {
    case "Paid":
      return { bg: "#ECFDF5", border: "#A7F3D0", text: "#059669", dot: "#10B981", icon: "checkmark-circle" as const };
    case "Created":
      return { bg: "#EFF6FF", border: "#BFDBFE", text: "#2563EB", dot: "#3B82F6", icon: "document-text" as const };
    default:
      return { bg: "#F9FAFB", border: "#E5E7EB", text: "#6B7280", dot: "#9CA3AF", icon: "create" as const };
  }
};

const formatCurrency = (value?: number) => `₹ ${Number(value || 0).toLocaleString("en-IN")}`;

const formatDate = (date?: string) => {
  if (!date) return "N/A";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HrTeamPayslipsScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);

  // ── year navigation (swipe like attendance) ──
  const [year, setYear] = useState(THIS_YEAR);

  const shiftYear = (step: number) =>
    setYear((cur) => {
      const next = cur + step;
      // don't go past current year
      return next > THIS_YEAR ? cur : next;
    });

  const shiftRef = useRef(shiftYear);
  shiftRef.current = shiftYear;

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        // swipe left → go forward in time (smaller year number? no—forward = bigger)
        // attendance: swipe left = +1 day. We do same: left = next year (bigger)
        // but we cap at THIS_YEAR. swipe right = previous year.
        if (g.dx <= -60) shiftRef.current(1);
        else if (g.dx >= 60) shiftRef.current(-1);
      },
    })
  ).current;

  // ── filters ──
  const [monthFilter, setMonthFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // ── data ──
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");
  useShellSearch(setSearchTerm);

  const requestIdRef = useRef(0);

  // ── shell filters ──
  useShellFilters([
    {
      key: "month",
      label: "Months",
      value: monthFilter,
      defaultValue: "All",
      options: toShellOptions(MONTH_OPTIONS),
      onChange: setMonthFilter,
    },
    {
      key: "status",
      label: "Status",
      value: statusFilter,
      defaultValue: "All",
      options: toShellOptions(STATUS_OPTIONS),
      onChange: setStatusFilter,
    },
  ]);

  // ── bottom sheet ──
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchPayslips = useCallback(
    async (pageToLoad = 1, opts: { silent?: boolean; reset?: boolean } = {}) => {
      const reqId = ++requestIdRef.current;

      if (pageToLoad === 1) {
        if (!opts.silent) setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const session = await getAuthSession();
        if (!session?.token) return;

        const params = new URLSearchParams();
        params.append("page", pageToLoad.toString());
        params.append("limit", "20");
        params.append("year", String(year));
        if (monthFilter !== "All") params.append("month", monthFilter);
        if (statusFilter !== "All") params.append("status", statusFilter);
        if (searchTerm.trim()) params.append("search", searchTerm.trim());

        const res = await apiFetch(`/api/hr/team-payslips?${params}`, session.token);
        if (!res.ok) return;

        const data = await res.json();
        if (reqId !== requestIdRef.current) return;

        const raw: Payslip[] = (data.payslips || (Array.isArray(data) ? data : [])).map(
          (d: any) => ({ ...d, id: d._id || d.id })
        );

        if (pageToLoad === 1) {
          setPayslips(raw);
        } else {
          setPayslips((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...raw.filter((p) => !seen.has(p.id))];
          });
        }

        if (data.pagination) {
          setPage(data.pagination.page || pageToLoad);
          setTotalPages(data.pagination.pages || 1);
        } else {
          setPage(pageToLoad);
          setTotalPages(raw.length < 20 ? pageToLoad : pageToLoad + 1);
        }
      } catch (err) {
        console.error("HR payslips fetch error:", err);
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [year, monthFilter, statusFilter, searchTerm]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchPayslips(1);
  }, [fetchPayslips]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    fetchPayslips(1, { silent: true });
  };

  const loadMore = () => {
    if (loading || loadingMore || page >= totalPages) return;
    fetchPayslips(page + 1, { silent: true });
  };

  // ─── Update Status ────────────────────────────────────────────────────────

  const updateStatus = async (status: PayslipStatus) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/hr/team-payslips/${selected.id}`, session.token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setPayslips((prev) => prev.map((p) => (p.id === selected.id ? { ...p, status } : p)));
        setSelected((prev) => (prev ? { ...prev, status } : prev));
      }
    } catch (err) {
      console.error("Update status error:", err);
    } finally {
      setUpdating(false);
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────

  const deletePayslip = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(`/api/hr/team-payslips/${selected.id}`, session.token, {
        method: "DELETE",
      });

      if (res.ok) {
        setPayslips((prev) => prev.filter((p) => p.id !== selected.id));
        setConfirmDelete(false);
        setSelected(null);
      }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleting(false);
    }
  };

  // ─── Derived counts ───────────────────────────────────────────────────────

  const paidCount = payslips.filter((p) => p.status === "Paid").length;
  const createdCount = payslips.filter((p) => p.status === "Created").length;
  const draftCount = payslips.filter((p) => p.status === "Draft").length;

  const deductionsOf = (p: Payslip) =>
    (p.pf || 0) + (p.esi || 0) + (p.pt || 0) + (p.tds || 0) + (p.leaveDeduction || 0);

  const getInitial = (name?: string) => name?.charAt(0)?.toUpperCase() || "?";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        {...swipe.panHandlers}
        {...shellScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingTop: shellTop, paddingBottom: 150 }}
        refreshControl={
          <RefreshControl
            progressViewOffset={shellTop}
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2563EB"
          />
        }
        onScrollEndDrag={(e) => {
          // load more when near bottom
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) {
            loadMore();
          }
        }}
      >
        {/* ── YEAR NAVIGATOR ── */}
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#F3F4F6",
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={() => shiftYear(-1)}
            style={{ padding: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color="#2563EB" />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: "#0F172A", fontSize: 22, fontWeight: "800" }}>{year}</Text>
            {/* <Text style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600", marginTop: 2 }}>
              {payslips.length} payslips · swipe to change year
            </Text> */}
          </View>

          <TouchableOpacity
            onPress={() => shiftYear(1)}
            style={{ padding: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={year >= THIS_YEAR}
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={year >= THIS_YEAR ? "#D1D5DB" : "#2563EB"}
            />
          </TouchableOpacity>
        </View>

        {/* ── STAT TILES ── */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          <StatTile icon="checkmark-circle-outline" label="Paid" value={String(paidCount)} color="#059669" bg="#ECFDF5" border="#A7F3D0" />
          <StatTile icon="document-text-outline" label="Created" value={String(createdCount)} color="#2563EB" bg="#EFF6FF" border="#BFDBFE" />
          <StatTile icon="create-outline" label="Draft" value={String(draftCount)} color="#6B7280" bg="#F9FAFB" border="#E5E7EB" />
        </View>

        {/* ── LIST ── */}
        <Text
          style={{
            color: "#94A3B8",
            fontSize: 10,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 12,
          }}
        >
          All payslips
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={{ color: "#94A3B8", fontSize: 13, marginTop: 10 }}>Loading payslips…</Text>
          </View>
        ) : payslips.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
            <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "500", marginTop: 12 }}>
              No payslips for {year}
            </Text>
          </View>
        ) : (
          payslips.map((slip) => {
            const theme = statusTheme(slip.status);
            const photo = slip.profileImage || slip.avatar;

            return (
              <TouchableOpacity
                key={slip.id}
                activeOpacity={0.7}
                onPress={() => setSelected(slip)}
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 20,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#F3F4F6",
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {/* Avatar */}
                  {photo ? (
                    <Image
                      source={{ uri: photo }}
                      style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#F3F4F6", marginRight: 14 }}
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
                        marginRight: 14,
                      }}
                    >
                      <Text style={{ color: "#2563EB", fontSize: 18, fontWeight: "700" }}>
                        {getInitial(slip.name)}
                      </Text>
                    </View>
                  )}

                  {/* Name + period */}
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ color: "#111827", fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
                      {slip.name}
                    </Text>
                    <Text style={{ color: "#6B7280", fontSize: 12, marginTop: 3 }} numberOfLines={1}>
                      {slip.month} {slip.year}
                    </Text>
                  </View>

                  {/* Status pill */}
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 8,
                      backgroundColor: theme.bg,
                      borderWidth: 1,
                      borderColor: theme.border,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.dot, marginRight: 5 }} />
                    <Text style={{ fontSize: 10, fontWeight: "800", color: theme.text }}>{slip.status}</Text>
                  </View>
                </View>

                {/* Net pay row */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 14,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: "#F3F4F6",
                  }}
                >
                  <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                    Net Pay
                  </Text>
                  <Text style={{ color: "#059669", fontSize: 16, fontWeight: "800" }}>
                    {formatCurrency(slip.netPay)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Load more spinner */}
        {loadingMore && (
          <View style={{ paddingVertical: 16, alignItems: "center" }}>
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        )}
      </ScrollView>

      {/* ── DETAIL BOTTOM SHEET ── */}
      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setSelected(null)} />

          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              maxHeight: "90%",
            }}
          >
            {/* Handle */}
            <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
              <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: "#D1D5DB" }} />
            </View>

            {/* Header row */}
            <View
              style={{
                padding: 20,
                borderBottomWidth: 1,
                borderBottomColor: "#F3F4F6",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 2 }}>
                  Payslip Details
                </Text>
                <Text style={{ fontSize: 13, color: "#6B7280" }}>
                  {selected?.month} {selected?.year}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelected(null)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="close" size={20} color="#4B5563" />
              </TouchableOpacity>
            </View>

            {!!selected && (
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                {/* Employee card */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    backgroundColor: "#F9FAFB",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    marginBottom: 14,
                  }}
                >
                  {selected.profileImage || selected.avatar ? (
                    <Image
                      source={{ uri: selected.profileImage || selected.avatar }}
                      style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#F3F4F6", marginRight: 12 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: "#EFF6FF",
                        borderWidth: 1,
                        borderColor: "#DBEAFE",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Text style={{ color: "#2563EB", fontSize: 20, fontWeight: "700" }}>
                        {getInitial(selected.name)}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }} numberOfLines={1}>
                      {selected.name}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }} numberOfLines={1}>
                      {selected.empId}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 10,
                      backgroundColor: statusTheme(selected.status).bg,
                      borderWidth: 1,
                      borderColor: statusTheme(selected.status).border,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: statusTheme(selected.status).dot,
                        marginRight: 4,
                      }}
                    />
                    <Text style={{ fontSize: 11, fontWeight: "800", color: statusTheme(selected.status).text }}>
                      {selected.status}
                    </Text>
                  </View>
                </View>

                {/* Net pay hero */}
                <View
                  style={{
                    padding: 18,
                    backgroundColor: "#ECFDF5",
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ color: "#059669", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>
                    Net Pay
                  </Text>
                  <Text style={{ color: "#065F46", fontSize: 30, fontWeight: "800", marginTop: 4 }}>
                    {formatCurrency(selected.netPay)}
                  </Text>
                  <Text style={{ color: "#059669", fontSize: 11, fontWeight: "600", marginTop: 4 }}>
                    Generated on {formatDate(selected.generatedOn)}
                  </Text>
                </View>

                {/* Pay Period */}
                <SheetSectionTitle icon="calendar-outline" color="#2563EB" title="Pay Period" />
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                  <SheetInfoCard icon="play-outline" iconBg="#D1FAE5" iconColor="#059669" label="Start Date" value={formatDate(selected.startDate)} />
                  <SheetInfoCard icon="stop-outline" iconBg="#FEE2E2" iconColor="#DC2626" label="End Date" value={formatDate(selected.endDate)} />
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
                  <SheetInfoCard icon="today-outline" iconBg="#EFF6FF" iconColor="#2563EB" label="Working Days" value={String(selected.totalWorkingDays ?? "--")} />
                  <SheetInfoCard icon="checkmark-done-outline" iconBg="#F5F3FF" iconColor="#7C3AED" label="Paid Days" value={String(selected.paidDays ?? "--")} />
                </View>

                {/* Earnings */}
                <SheetSectionTitle icon="trending-up-outline" color="#059669" title="Earnings" />
                <AmountRow label="Basic Salary" value={selected.basicSalary} positive />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: "#ECFDF5",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#A7F3D0",
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ color: "#065F46", fontSize: 12, fontWeight: "800" }}>Gross Earnings</Text>
                  <Text style={{ color: "#065F46", fontSize: 13, fontWeight: "800" }}>
                    {formatCurrency(selected.basicSalary)}
                  </Text>
                </View>

                {/* Deductions */}
                <SheetSectionTitle icon="trending-down-outline" color="#DC2626" title="Deductions" />
                <AmountRow label="Provident Fund (PF)" value={selected.pf} />
                <AmountRow label="ESI" value={selected.esi} />
                <AmountRow label="Professional Tax (PT)" value={selected.pt} />
                <AmountRow label="TDS" value={selected.tds} />
                <AmountRow
                  label={`Leave Deduction${selected.leavesTaken ? ` (${selected.leavesTaken} days)` : ""}`}
                  value={selected.leaveDeduction}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: "#FEF2F2",
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: "#FECACA",
                    marginBottom: 20,
                  }}
                >
                  <Text style={{ color: "#991B1B", fontSize: 12, fontWeight: "800" }}>Total Deductions</Text>
                  <Text style={{ color: "#991B1B", fontSize: 13, fontWeight: "800" }}>
                    {formatCurrency(deductionsOf(selected))}
                  </Text>
                </View>

                {/* Update Status */}
                <SheetSectionTitle icon="swap-horizontal-outline" color="#7C3AED" title="Update Status" />
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                  {(["Draft", "Created", "Paid"] as PayslipStatus[]).map((s) => {
                    const t = statusTheme(s);
                    const active = selected.status === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        disabled={updating || active}
                        onPress={() => updateStatus(s)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: active ? t.bg : "#F9FAFB",
                          borderWidth: 1.5,
                          borderColor: active ? t.text : "#E5E7EB",
                          alignItems: "center",
                          opacity: updating ? 0.6 : 1,
                        }}
                      >
                        <Ionicons name={t.icon} size={17} color={active ? t.text : "#9CA3AF"} style={{ marginBottom: 4 }} />
                        <Text style={{ fontSize: 11, fontWeight: active ? "800" : "600", color: active ? t.text : "#6B7280" }}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {updating && (
                  <View style={{ alignItems: "center", marginBottom: 14 }}>
                    <ActivityIndicator size="small" color="#2563EB" />
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── DELETE CONFIRM ── */}
      <Modal
        visible={confirmDelete}
        animationType="slide"
        transparent
        onRequestClose={() => setConfirmDelete(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <ModalDismiss onPress={() => setConfirmDelete(false)} />
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827" }}>Delete Payslip</Text>
              <TouchableOpacity
                onPress={() => setConfirmDelete(false)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={18} color="#4B5563" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 14, color: "#6B7280", lineHeight: 21, marginBottom: 24 }}>
              This will permanently remove the {selected?.month} {selected?.year} payslip for {selected?.name}. This action cannot be undone.
            </Text>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => setConfirmDelete(false)}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center" }}
              >
                <Text style={{ color: "#4B5563", fontWeight: "600", fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={deleting}
                onPress={deletePayslip}
                style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#DC2626", alignItems: "center", opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 15 }}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({
  icon,
  label,
  value,
  color,
  bg,
  border,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bg,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: border,
        padding: 14,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={{ color, fontSize: 20, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color, fontSize: 10, fontWeight: "700", marginTop: 2, opacity: 0.75 }}>{label}</Text>
    </View>
  );
}

function SheetSectionTitle({
  icon,
  color,
  title,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#F3F4F6",
      }}
    >
      <Ionicons name={icon} size={15} color={color} style={{ marginRight: 7 }} />
      <Text style={{ color: "#374151", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </Text>
    </View>
  );
}

function AmountRow({ label, value, positive }: { label: string; value?: number; positive?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: "#F9FAFB",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 8,
      }}
    >
      <Text style={{ color: "#4B5563", fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ color: positive ? "#059669" : "#DC2626", fontSize: 13, fontWeight: "700", marginLeft: 10 }}>
        {positive ? "" : "- "}{formatCurrency(value)}
      </Text>
    </View>
  );
}

function SheetInfoCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        backgroundColor: "#F9FAFB",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={{ color: "#9CA3AF", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>{label}</Text>
      <Text style={{ color: "#111827", fontSize: 13, fontWeight: "700", marginTop: 2 }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
