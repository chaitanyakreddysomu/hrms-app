import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * ============================================================
 * CONFIRM DIALOG
 * ============================================================
 *
 * The app version of Alert.alert: a sheet that rises from the
 * bottom, styled like the rest of the shell instead of the
 * platform default. Leave `onConfirm` out for a plain message
 * and it shows a single dismiss button.
 */
interface Props {
  visible: boolean;
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** paints the icon and the confirm button red */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  icon,
  danger = false,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: Props) {
  const accent = danger ? "#DC2626" : "#2563EB";
  const wash = danger ? "#FEF2F2" : "#EFF6FF";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />

          {!!icon && (
            <View style={[styles.iconWrap, { backgroundColor: wash }]}>
              <Ionicons name={icon} size={26} color={accent} />
            </View>
          )}

          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.actions}>
            {!!onConfirm && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onClose}
                style={[styles.button, styles.cancel]}
              >
                <Text style={styles.cancelText}>{cancelLabel}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                onClose();
                onConfirm?.();
              }}
              style={[
                styles.button,
                { backgroundColor: onConfirm ? accent : "#0F172A" },
              ]}
            >
              <Text style={styles.confirmText}>
                {onConfirm ? confirmLabel : "Got it"}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 34,
    alignItems: "center",
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    marginBottom: 20,
  },
  iconWrap: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 6,
  },
  actions: {
    flexDirection: "row",
    alignSelf: "stretch",
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: "center",
  },
  cancel: {
    backgroundColor: "#F1F5F9",
  },
  cancelText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
  },
  confirmText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
