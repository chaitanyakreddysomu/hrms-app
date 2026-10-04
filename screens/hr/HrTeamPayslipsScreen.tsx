import React, { useCallback, useEffect, useRef, useState } from "react";
import {
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
import { apiFetch } from "../../utils/api";
import { useShellScroll } from "../../components/ScreenActions";
import { useShellContentTop } from "../../components/shellMetrics";
import { useToast } from "../../components/Toast";
import {
  Card,
  EmptyState,
  IconTile,
  Loading,
  Row,
  SectionTitle,
  StatusPill,
  formatDate,
  formatMoney,
} from "./ui";

/**
 * ============================================================
 * TEAM PAYSLIPS
 * ============================================================
 *
 * GET /api/admin/payslips is what the HR console reads, filtered
 * by year here the same way. HR views them; generating a payslip
 * stays with the admin console.
 */
interface Payslip {
  _id: string;
  empId?: string;
  name?: string;
  month: string;
  year: string;
  netPay: number;
  status: "Draft" | "Created" | "Paid";
  generatedOn?: string;
  basicSalary?: number;
  pf?: number;
  esi?: number;
  pt?: number;
  tds?: number;
  leavesTaken?: number;
  totalWorkingDays?: number;
  paidDays?: number;
  leaveDeduction?: number;
}

export default function HrTeamPayslipsScreen() {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const thisYear = new Date().getFullYear();

  const [year, setYear] = useState(String(thisYear));
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Payslip | null>(null);

  const shiftYear = (step: number) =>
    setYear((current) => String(Number(current) + step));

  const shiftRef = useRef(shiftYear);
  shiftRef.current = shiftYear;

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > 24 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dx <= -60) shiftRef.current(1);
        else if (gesture.dx >= 60) shiftRef.current(-1);
      },
    })
  ).current;

  const load = useCallback(async () => {
    try {
      const session = await getAuthSession();
      if (!session?.token) return;

      const res = await apiFetch(
        `/api/admin/payslips?year=${year}`,
        session.token
      );

      if (!res.ok) {
        showToast({
          type: "error",
          title: "Payslips Unavailable",
          message: "Could not load this year.",
        });

        return;
      }

      const data = await res.json();
      setPayslips(Array.isArray(data) ? data : data?.payslips || []);
    } catch (error) {
      console.error("HR payslips error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const paid = payslips.filter((p) => p.status === "Paid");

  const total = paid.reduce((sum, p) => sum + (p.netPay || 0), 0);

  const deductions = (slip: Payslip) =>
    (slip.pf || 0) +
    (slip.esi || 0) +
    (slip.pt || 0) +
    (slip.tds || 0) +
    (slip.leaveDeduction || 0);

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
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#2563EB"
          />
        }
      >
        {/* YEAR */}

        <Card style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() => shiftYear(-1)}
            style={{ padding: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={20} color="#2563EB" />
          </TouchableOpacity>

          <View style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{ color: "#0F172A", fontSize: 15, fontWeight: "800" }}
            >
              {year}
            </Text>

            <Text
              style={{ color: "#94A3B8", fontSize: 11, fontWeight: "600" }}
            >
              {payslips.length} payslips, swipe to change year
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => shiftYear(1)}
            style={{ padding: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={20} color="#2563EB" />
          </TouchableOpacity>
        </Card>

        {/* YEAR TOTAL */}

        <Card>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconTile icon="wallet-outline" tone="green" />

            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text
                style={{
                  color: "#94A3B8",
                  fontSize: 11,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                Paid out in {year}
              </Text>

              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 22,
                  fontWeight: "800",
                  marginTop: 2,
                }}
              >
                {formatMoney(total)}
              </Text>
            </View>

            <Text
              style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700" }}
            >
              {paid.length} of {payslips.length}
            </Text>
          </View>
        </Card>

        <SectionTitle>All payslips</SectionTitle>

        {loading ? (
          <Loading label="Loading payslips" />
        ) : payslips.length === 0 ? (
          <EmptyState
            icon="receipt-outline"
            title="No payslips"
            message={`Nothing has been generated for ${year} yet.`}
          />
        ) : (
          payslips.map((slip) => (
            <Card key={slip._id} onPress={() => setOpen(slip)}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <IconTile
                  icon="receipt-outline"
                  tone={slip.status === "Paid" ? "green" : "amber"}
                />

                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={{
                      color: "#0F172A",
                      fontSize: 14,
                      fontWeight: "800",
                    }}
                    numberOfLines={1}
                  >
                    {slip.name || slip.empId || "Employee"}
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 3,
                    }}
                  >
                    {slip.month} {slip.year} · {formatMoney(slip.netPay)}
                  </Text>
                </View>

                <StatusPill status={slip.status} />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* ============================================================
          ONE PAYSLIP IN FULL
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
                marginBottom: 8,
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
                {open?.name || open?.empId}
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
                    borderRadius: 24,
                    backgroundColor: "#ECFDF5",
                    padding: 18,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#047857",
                      fontSize: 11,
                      fontWeight: "800",
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                  >
                    Net pay · {open.month} {open.year}
                  </Text>

                  <Text
                    style={{
                      color: "#065F46",
                      fontSize: 30,
                      fontWeight: "800",
                      marginTop: 4,
                    }}
                  >
                    {formatMoney(open.netPay)}
                  </Text>

                  <View style={{ marginTop: 8 }}>
                    <StatusPill status={open.status} />
                  </View>
                </View>

                <SectionTitle>Earnings</SectionTitle>

                <Card>
                  <Row
                    label="Basic salary"
                    value={formatMoney(open.basicSalary)}
                  />
                  <Row
                    label="Generated on"
                    value={formatDate(open.generatedOn)}
                    last
                  />
                </Card>

                <SectionTitle>Deductions</SectionTitle>

                <Card>
                  <Row label="Provident fund" value={formatMoney(open.pf)} />
                  <Row label="ESI" value={formatMoney(open.esi)} />
                  <Row label="Professional tax" value={formatMoney(open.pt)} />
                  <Row label="TDS" value={formatMoney(open.tds)} />
                  <Row
                    label="Leave deduction"
                    value={formatMoney(open.leaveDeduction)}
                  />
                  <Row
                    label="Total deducted"
                    value={formatMoney(deductions(open))}
                    last
                  />
                </Card>

                <SectionTitle>Attendance</SectionTitle>

                <Card>
                  <Row
                    label="Working days"
                    value={open.totalWorkingDays ?? "N/A"}
                  />
                  <Row label="Paid days" value={open.paidDays ?? "N/A"} />
                  <Row
                    label="Leaves taken"
                    value={open.leavesTaken ?? "N/A"}
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
