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
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

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
  PrimaryButton,
  Row,
  SectionTitle,
  StatusPill,
  formatDate,
  formatMoney,
} from "./ui";
import ModalDismiss from "../../components/ModalDismiss";

/**
 * ============================================================
 * MY PAYSLIPS
 * ============================================================
 *
 * GET /api/employee/payslips?year= lists the year, and tapping a
 * row opens the same breakdown the web page prints: earnings,
 * the statutory deductions and the paid day count.
 */
interface Payslip {
  _id: string;
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
  name?: string;
  empId?: string;
  startDate?: string;
  endDate?: string;
}

interface Props {
  listPath?: string;
  profilePath?: string;
}

export default function EmployeePayslipsScreen({
  listPath = "/api/employee/payslips",
  profilePath = "/api/employee/profile",
}: Props = {}) {
  const shellScroll = useShellScroll();
  const shellTop = useShellContentTop(16);
  const { showToast } = useToast();

  const thisYear = new Date().getFullYear();

  const [year, setYear] = useState(String(thisYear));
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Payslip | null>(null);
  const [profile, setProfile] = useState<any>(null);

  const [downloading, setDownloading] = useState(false);

  const shiftYear = (step: number) =>
    setYear((current) => String(Number(current) + step));

  const shiftRef = useRef(shiftYear);
  shiftRef.current = shiftYear;

  /** a horizontal drag walks the years, as the month does */
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
        `${listPath}?year=${year}`,
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
      setPayslips(Array.isArray(data) ? data : []);

      /** the PDF header needs the name and the employee id */
      const who = await apiFetch(profilePath, session.token);
      if (who.ok) setProfile(await who.json().catch(() => null));
    } catch (error) {
      console.error("Payslips load error:", error);

      showToast({
        type: "error",
        title: "Network Problem",
        message: "Could not reach the server.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, listPath, profilePath]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const paid = payslips.filter((p) => p.status === "Paid");

  const earned = paid.reduce((sum, p) => sum + (p.netPay || 0), 0);

  /**
   * ============================================================
   * NET PAY IN WORDS
   * ============================================================
   *
   * The printed payslip spells the amount out under the figure,
   * the way the web template does, in the Indian numbering system.
   */
  const numberToWords = (num: number): string => {
    if (!num) return "Zero Rupees Only";

    const units = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
    ];

    const teens = [
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];

    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const underThousand = (n: number): string => {
      if (n === 0) return "";
      if (n < 10) return units[n];
      if (n < 20) return teens[n - 10];

      const digit = n % 10;
      return tens[Math.floor(n / 10)] + (digit ? " " + units[digit] : "");
    };

    const convert = (n: number): string => {
      if (n === 0) return "";
      if (n < 100) return underThousand(n);

      if (n < 1000) {
        return (
          units[Math.floor(n / 100)] +
          " Hundred" +
          (n % 100 ? " " + convert(n % 100) : "")
        );
      }

      if (n < 100000) {
        return (
          convert(Math.floor(n / 1000)) +
          " Thousand" +
          (n % 1000 ? " " + convert(n % 1000) : "")
        );
      }

      if (n < 10000000) {
        return (
          convert(Math.floor(n / 100000)) +
          " Lakh" +
          (n % 100000 ? " " + convert(n % 100000) : "")
        );
      }

      return (
        convert(Math.floor(n / 10000000)) +
        " Crore" +
        (n % 10000000 ? " " + convert(n % 10000000) : "")
      );
    };

    return "Rupees " + convert(Math.round(num)) + " Only";
  };

  /**
   * ============================================================
   * DOWNLOAD AS PDF
   * ============================================================
   *
   * The web page screenshots a hidden template with html2canvas
   * and saves it through jsPDF. There is no DOM here, so the same
   * template is written as HTML and printed straight to a file,
   * then handed to the share sheet, which is how a phone saves a
   * document. The layout follows the web one field for field.
   */
  const download = async (slip: Payslip) => {
    if (downloading) return;

    setDownloading(true);

    try {
      const money = (value?: number | null) =>
        "&#8377; " + Number(value || 0).toLocaleString("en-IN");

      const totalDeducted =
        (slip.pf || 0) +
        (slip.esi || 0) +
        (slip.pt || 0) +
        (slip.tds || 0) +
        (slip.leaveDeduction || 0);

      /** the slip carries these when it can, the profile fills in */
      const name = slip.name || profile?.name || "Employee";
      const empId = slip.empId || profile?.id || "ID";
      const designation = profile?.designation || "Employee";

      const deductionRow = (label: string, value?: number | null) => `
        <tr>
          <td class="label">${label}</td>
          <td class="value">${money(value)}</td>
        </tr>
      `;

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              * { box-sizing: border-box; }

              body {
                font-family: Helvetica, Arial, sans-serif;
                color: #0f172a;
                margin: 0;
                padding: 32px;
              }

              .head {
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #cbd5e1;
                padding-bottom: 24px;
                margin-bottom: 24px;
              }

              .brand {
                font-size: 26px;
                font-weight: 800;
                color: #064e3b;
                letter-spacing: -0.5px;
              }

              .brand small {
                display: block;
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 3px;
                color: #64748b;
                margin-top: 4px;
              }

              .title {
                text-align: right;
              }

              .title h2 {
                margin: 0;
                font-size: 30px;
                font-weight: 800;
                color: #064e3b;
              }

              .title p {
                margin: 4px 0 0;
                color: #64748b;
                font-size: 12px;
                letter-spacing: 3px;
                text-transform: uppercase;
              }

              .details {
                display: flex;
                justify-content: space-between;
                margin-bottom: 24px;
                font-size: 13px;
              }

              .details .caption {
                color: #64748b;
                font-size: 10px;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                margin-bottom: 4px;
              }

              .details .who {
                font-size: 19px;
                font-weight: 700;
              }

              .details .muted { color: #475569; }
              .details .right { text-align: right; }

              .split {
                display: flex;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                overflow: hidden;
                margin-bottom: 24px;
              }

              .col { width: 50%; }
              .col + .col { border-left: 1px solid #cbd5e1; }

              .col h3 {
                margin: 0;
                padding: 12px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                border-bottom: 1px solid #cbd5e1;
              }

              .earnings h3 { background: #ecfdf5; color: #065f46; }
              .deductions h3 { background: #fef2f2; color: #991b1b; }

              table { width: 100%; border-collapse: collapse; }

              td {
                padding: 8px 16px;
                font-size: 13px;
              }

              td.label { color: #475569; }
              td.value { text-align: right; font-weight: 600; }

              tr.total td {
                border-top: 1px solid #e2e8f0;
                font-weight: 800;
                color: #0f172a;
                padding-top: 12px;
              }

              .net {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 24px;
                text-align: right;
              }

              .net .caption {
                color: #64748b;
                font-size: 10px;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                margin-bottom: 4px;
              }

              .net .amount {
                font-size: 34px;
                font-weight: 800;
                color: #047857;
              }

              .net .words {
                color: #64748b;
                font-size: 13px;
                font-style: italic;
                margin-top: 8px;
              }

              .foot {
                margin-top: 48px;
                text-align: center;
                color: #94a3b8;
                font-size: 11px;
              }
            </style>
          </head>

          <body>
            <div class="head">
              <div class="brand">
                ICS HRMS
                <small>INNER CIRCLE</small>
              </div>

              <div class="title">
                <h2>PAYSLIP</h2>
                <p>${slip.month} ${slip.year}</p>
              </div>
            </div>

            <div class="details">
              <div>
                <div class="caption">Employee Details</div>
                <div class="who">${name}</div>
                <div class="muted">${empId}</div>
                <div class="muted" style="margin-top:8px">
                  Designation: ${designation}
                </div>
              </div>

              <div class="right">
                <div class="caption">Pay Period</div>
                <div>${slip.startDate || "-"} to ${slip.endDate || "-"}</div>
                <div class="muted" style="margin-top:8px">
                  Paid Days: <b>${slip.paidDays ?? 30}</b>
                </div>
                <div class="muted">
                  Leaves Taken: <b>${slip.leavesTaken ?? 0}</b>
                </div>
              </div>
            </div>

            <div class="split">
              <div class="col earnings">
                <h3>Earnings</h3>

                <table>
                  <tr>
                    <td class="label">Basic Salary</td>
                    <td class="value">${money(slip.basicSalary)}</td>
                  </tr>

                  <tr class="total">
                    <td>Gross Earnings</td>
                    <td class="value">${money(slip.basicSalary)}</td>
                  </tr>
                </table>
              </div>

              <div class="col deductions">
                <h3>Deductions</h3>

                <table>
                  ${deductionRow("PF", slip.pf)}
                  ${deductionRow("ESI", slip.esi)}
                  ${deductionRow("PT", slip.pt)}
                  ${deductionRow("TDS", slip.tds)}
                  ${deductionRow("Leave Deduction", slip.leaveDeduction)}

                  <tr class="total">
                    <td>Total Deductions</td>
                    <td class="value">${money(totalDeducted)}</td>
                  </tr>
                </table>
              </div>
            </div>

            <div class="net">
              <div class="caption">Net Pay</div>
              <div class="amount">${money(slip.netPay)}</div>
              <div class="words">${numberToWords(slip.netPay)}</div>
            </div>

            <div class="foot">
              This is a computer-generated document and does not require a
              signature.
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Payslip ${slip.month} ${slip.year}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        showToast({
          type: "success",
          title: "PDF Ready",
          message: "Saved to the app storage.",
        });
      }
    } catch (error) {
      console.error("Payslip PDF error:", error);

      showToast({
        type: "error",
        title: "Download Failed",
        message: "Could not build the PDF.",
      });
    } finally {
      setDownloading(false);
    }
  };

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
                Paid in {year}
              </Text>

              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 22,
                  fontWeight: "800",
                  marginTop: 2,
                }}
              >
                {formatMoney(earned)}
              </Text>
            </View>

            <Text
              style={{ color: "#94A3B8", fontSize: 11, fontWeight: "700" }}
            >
              {paid.length} of {payslips.length}
            </Text>
          </View>
        </Card>

        <SectionTitle>Monthly slips</SectionTitle>

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
                  >
                    {slip.month} {slip.year}
                  </Text>

                  <Text
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontWeight: "600",
                      marginTop: 3,
                    }}
                  >
                    Net {formatMoney(slip.netPay)}
                  </Text>
                </View>

                <StatusPill status={slip.status} />

                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color="#CBD5E1"
                  style={{ marginLeft: 8 }}
                />
              </View>
            </Card>
          ))
        )}
      </ScrollView>

      {/* ============================================================
          PAYSLIP BREAKDOWN
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
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  color: "#0F172A",
                  fontSize: 20,
                  fontWeight: "800",
                }}
              >
                {open?.month} {open?.year}
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
                {/* the headline figure */}
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
                    Net pay
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
                  <Row label="Basic salary" value={formatMoney(open.basicSalary)} />
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

                <PrimaryButton
                  label="Download PDF"
                  icon="download-outline"
                  onPress={() => download(open)}
                  busy={downloading}
                  style={{ marginTop: 10, marginBottom: 14 }}
                />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
