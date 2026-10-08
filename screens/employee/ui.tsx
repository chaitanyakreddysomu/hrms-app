import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";

/**
 * ============================================================
 * EMPLOYEE UI KIT
 * ============================================================
 *
 * The pieces every employee screen is built from, so the whole
 * section reads like the admin one: white cards on a light
 * ground, a coloured icon tile, and quiet grey supporting text.
 */

export const TONE = {
  blue: { bg: "#EFF6FF", fg: "#2563EB" },
  green: { bg: "#ECFDF5", fg: "#059669" },
  amber: { bg: "#FFFBEB", fg: "#D97706" },
  red: { bg: "#FEF2F2", fg: "#DC2626" },
  purple: { bg: "#F5F3FF", fg: "#7C3AED" },
  slate: { bg: "#F1F5F9", fg: "#475569" },
} as const;

export type ToneName = keyof typeof TONE;

/** the status vocabulary shared by leaves, payslips and complaints */
export const STATUS_TONE: Record<string, ToneName> = {
  Approved: "green",
  Paid: "green",
  Present: "green",
  Resolved: "green",
  Selected: "green",
  Active: "green",
  Joined: "green",
  Inactive: "red",
  Pending: "amber",
  Open: "blue",
  Investigating: "purple",
  Late: "amber",
  "Half Day": "amber",
  Review: "amber",
  Created: "blue",
  "In Review": "blue",
  Draft: "slate",
  "On Leave": "blue",
  Holiday: "purple",
  Rejected: "red",
  Absent: "red",
};

export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const body = (
    <View
      style={[
        {
          backgroundColor: "#FFFFFF",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "#EEF2F7",
          padding: 16,
          marginBottom: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      {body}
    </TouchableOpacity>
  );
}

export function IconTile({
  icon,
  tone = "blue",
  size = 44,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone?: ToneName;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: TONE[tone].bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={icon}
        size={Math.round(size * 0.48)}
        color={TONE[tone].fg}
      />
    </View>
  );
}

export function StatusPill({ status }: { status?: string }) {
  const tone = TONE[STATUS_TONE[status || ""] || "slate"];

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: tone.bg,
      }}
    >
      <Text style={{ color: tone.fg, fontSize: 10, fontWeight: "800" }}>
        {status || "Unknown"}
      </Text>
    </View>
  );
}

export function SectionTitle({
  children,
  action,
  onAction,
}: {
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 18,
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: "#94A3B8",
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.1,
          textTransform: "uppercase",
        }}
      >
        {children}
      </Text>

      {!!action && (
        <TouchableOpacity onPress={onAction} activeOpacity={0.7}>
          <Text style={{ color: "#2563EB", fontSize: 12, fontWeight: "700" }}>
            {action}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function StatTile({
  icon,
  label,
  value,
  tone = "blue",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: ToneName;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#EEF2F7",
        padding: 14,
      }}
    >
      <IconTile icon={icon} tone={tone} size={34} />

      <Text
        style={{
          color: "#0F172A",
          fontSize: 18,
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

export function Row({
  label,
  value,
  last,
}: {
  label: string;
  value?: string | number | null;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: "#F1F5F9",
      }}
    >
      <Text style={{ color: "#64748B", fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>

      <Text
        style={{
          color: "#0F172A",
          fontSize: 13,
          fontWeight: "700",
          flex: 1,
          textAlign: "right",
          marginLeft: 16,
        }}
        numberOfLines={2}
      >
        {value === undefined || value === null || value === ""
          ? "N/A"
          : String(value)}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 54 }}>
      <IconTile icon={icon} tone="slate" size={64} />

      <Text
        style={{
          color: "#0F172A",
          fontSize: 15,
          fontWeight: "800",
          marginTop: 14,
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          color: "#94A3B8",
          fontSize: 12,
          textAlign: "center",
          marginTop: 6,
          paddingHorizontal: 40,
          lineHeight: 18,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 60 }}>
      <ActivityIndicator color="#2563EB" />

      <Text
        style={{
          color: "#94A3B8",
          fontSize: 12,
          fontWeight: "600",
          marginTop: 10,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  busy,
  disabled,
  tone = "blue",
  style,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: ToneName;
  style?: any;
}) {
  const off = busy || disabled;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={off}
      style={[
        {
          height: 50,
        borderRadius: 12,
          backgroundColor: off ? "#CBD5E1" : TONE[tone].fg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {!!icon && <Ionicons name={icon} size={17} color="#FFFFFF" />}

          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 14,
              fontWeight: "700",
              marginLeft: icon ? 8 : 0,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** dates arrive as ISO strings or Date objects depending on the route */
export function formatDate(value?: string | Date | null) {
  if (!value) return "N/A";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatMoney(value?: number | null) {
  if (value === undefined || value === null) return "N/A";

  return "₹ " + Number(value).toLocaleString("en-IN");
}


/**
 * ============================================================
 * DATE FIELD
 * ============================================================
 *
 * A tap opens the platform date picker instead of a keyboard.
 * The value travels as YYYY-MM-DD, the shape the API stores, but
 * is shown the way a person reads a date.
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = "Select a date",
  minimumDate,
  maximumDate,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const [open, setOpen] = useState(false);

  /** an empty field opens on today rather than on the epoch */
  const parsed = value ? new Date(value) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime());

  const toStored = (date: Date) => {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${month}-${day}`;
  };

  return (
    <View style={{ marginTop: 16 }}>
      <Text
        style={{
          color: "#374151",
          fontSize: 12,
          fontWeight: "700",
          marginBottom: 8,
        }}
      >
        {label}
      </Text>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
        style={{
          height: 48,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#E5E7EB",
          backgroundColor: "#F9FAFB",
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <Ionicons name="calendar-outline" size={17} color="#6B7280" />

        <Text
          style={{
            flex: 1,
            marginLeft: 10,
            color: valid ? "#111827" : "#9CA3AF",
            fontSize: 14,
            fontWeight: "500",
          }}
        >
          {valid ? formatDate(parsed!) : placeholder}
        </Text>

        {!!valid && (
          <TouchableOpacity
            onPress={() => onChange("")}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={17} color="#CBD5E1" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {open && (
        <DateTimePicker
          value={valid ? parsed! : new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(event, selected) => {
            /** Android closes itself, iOS keeps the spinner up */
            if (Platform.OS !== "ios") setOpen(false);

            if (event.type === "dismissed") return;
            if (selected) onChange(toStored(selected));
          }}
        />
      )}

      {open && Platform.OS === "ios" && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setOpen(false)}
          style={{
            alignSelf: "flex-end",
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{ color: "#2563EB", fontSize: 13, fontWeight: "800" }}
          >
            Done
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
