import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

/**
 * ============================================================
 * TOAST
 * ============================================================
 *
 * Short lived messages that slide in from the right edge and sit
 * in the top right corner, just under the floating pill header.
 * They replace the centre-screen popups for anything the user
 * does not have to answer: errors, confirmations of a copy, and
 * other one-line notices.
 */
export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastInput {
  type?: ToastType;
  title?: string;
  message: string;
  /** milliseconds on screen before it leaves on its own */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastInput, "title">> {
  id: number;
  title?: string;
}

interface ToastApi {
  showToast: (input: ToastInput | string) => void;
  hideToast: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** header bottom edge, matching the anchor the shell menus use */
const HEADER_CLEARANCE = 60;

const LOOK: Record<
  ToastType,
  { icon: keyof typeof Ionicons.glyphMap; tint: string; rail: string }
> = {
  success: { icon: "checkmark-circle", tint: "#047857", rail: "#10B981" },
  error: { icon: "alert-circle", tint: "#B91C1C", rail: "#EF4444" },
  warning: { icon: "warning", tint: "#B45309", rail: "#F59E0B" },
  info: { icon: "information-circle", tint: "#1D4ED8", rail: "#3B82F6" },
};

/**
 * Wrap the app once. Every screen below can then raise a toast
 * through useToast, and they all land in the same corner.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const hideToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput | string) => {
    const config: ToastInput =
      typeof input === "string" ? { message: input } : input;

    const item: ToastItem = {
      id: nextId.current++,
      type: config.type || "info",
      title: config.title,
      message: config.message,
      duration: config.duration ?? 2800,
    };

    /** newest on top, and never more than three at once */
    setToasts((current) => [item, ...current].slice(0, 3));
  }, []);

  const api = useMemo(() => ({ showToast, hideToast }), [showToast, hideToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastStack toasts={toasts} onHide={hideToast} />
    </ToastContext.Provider>
  );
}

/**
 * Raising a toast from anywhere under the provider. Outside it the
 * calls are swallowed rather than crashing the screen.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);

  const fallback = useMemo<ToastApi>(
    () => ({ showToast: () => {}, hideToast: () => {} }),
    []
  );

  return api || fallback;
}

function ToastStack({
  toasts,
  onHide,
}: {
  toasts: ToastItem[];
  onHide: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();

  if (!toasts.length) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.stack, { top: insets.top + HEADER_CLEARANCE }]}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onHide={onHide} />
      ))}
    </View>
  );
}

function ToastCard({
  toast,
  onHide,
}: {
  toast: ToastItem;
  onHide: (id: number) => void;
}) {
  /** starts off the right edge and rides in to its resting place */
  const shift = useRef(new Animated.Value(1)).current;
  const dismissed = useRef(false);

  const leave = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;

    Animated.timing(shift, {
      toValue: 1,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => onHide(toast.id));
  }, [onHide, shift, toast.id]);

  useEffect(() => {
    Animated.spring(shift, {
      toValue: 0,
      friction: 9,
      tension: 70,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(leave, toast.duration);
    return () => clearTimeout(timer);
  }, []);

  const look = LOOK[toast.type];

  const translateX = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 340],
  });

  const opacity = shift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX }], opacity }]}
    >
      <View style={[styles.rail, { backgroundColor: look.rail }]} />

      <Ionicons name={look.icon} size={18} color={look.tint} />

      <View style={styles.body}>
        {!!toast.title && (
          <Text style={[styles.title, { color: look.tint }]} numberOfLines={1}>
            {toast.title}
          </Text>
        )}
        <Text style={styles.message} numberOfLines={3}>
          {toast.message}
        </Text>
      </View>

      <TouchableOpacity
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={leave}
      >
        <Ionicons name="close" size={16} color="#9CA3AF" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    right: 14,
    left: 60,
    alignItems: "flex-end",
    zIndex: 999,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: "100%",
    paddingVertical: 11,
    paddingLeft: 16,
    paddingRight: 12,
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(17,24,39,0.08)",
    shadowColor: "#0B0B0F",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  rail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  body: {
    flexShrink: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 1,
  },
  message: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
});
