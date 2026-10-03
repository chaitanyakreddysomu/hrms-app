import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassSurface from "./GlassSurface";

/**
 * ============================================================
 * HEADER MENU
 * ============================================================
 *
 * The list that drops out of the three dot button, anchored to
 * the top right corner it grows from.
 *
 * A row carrying `options` is a filter: tapping it swaps the whole
 * menu for that filter option list, the current value marked in
 * blue. Picking one applies it and returns to the root list.
 */
export interface HeaderMenuOption {
  value: string;
  label: string;
}

export interface HeaderMenuItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  /** turns the row into a filter with its own option list */
  options?: HeaderMenuOption[];
  value?: string;
  onSelect?: (value: string) => void;
  /** draws a separator under this row */
  divider?: boolean;
  danger?: boolean;
}

interface Props {
  visible: boolean;
  items: HeaderMenuItem[];
  /** distance from the top edge; the menu grows downwards */
  top?: number;
  /** distance from the bottom edge instead; the menu grows upwards */
  bottom?: number;
  /** which edge the card is pinned to, right by default */
  align?: "left" | "right";
  onClose: () => void;
}

export default function HeaderMenu({
  visible,
  items,
  top,
  bottom,
  align = "right",
  onClose,
}: Props) {
  /** anchored to the bottom it has to rise into place, not drop */
  const fromBottom = bottom !== undefined;
  const anim = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(1)).current;
  const [mounted, setMounted] = useState(visible);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setMounted(true);
    else setOpenKey(null);

    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      easing: visible ? Easing.out(Easing.back(1.3)) : Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, anim]);

  /** small cross fade when the menu swaps between its two levels */
  const showLevel = (key: string | null) => {
    Animated.timing(swap, {
      toValue: 0,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      setOpenKey(key);
      Animated.timing(swap, {
        toValue: 1,
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  if (!mounted) return null;

  const scale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.82, 1],
  });

  const shift = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [fromBottom ? 10 : -10, 0],
  });

  const open = items.find((item) => item.key === openKey);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <Animated.View
        style={[
          styles.wrap,
          fromBottom ? { bottom } : { top },
          align === "left" ? styles.pinLeft : styles.pinRight,
          {
            opacity: anim,
            transform: [{ translateY: shift }, { scale }],
          },
        ]}
      >
        <GlassSurface radius={22} intensity={70} style={styles.card}>
          <Animated.View style={{ opacity: swap }}>
            {open ? (
              <View style={styles.list}>
                <TouchableOpacity
                  activeOpacity={0.65}
                  onPress={() => showLevel(null)}
                  style={styles.backRow}
                >
                  <Ionicons name="chevron-back" size={20} color="#2563EB" />
                  <Text style={styles.backLabel}>{open.label}</Text>
                </TouchableOpacity>
                <View style={styles.divider} />

                <ScrollView
                  style={styles.options}
                  showsVerticalScrollIndicator={false}
                >
                  {open.options?.map((option) => {
                    const active = option.value === open.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.7}
                        onPress={() => {
                          open.onSelect?.(option.value);
                          showLevel(null);
                        }}
                        style={[
                          styles.optionRow,
                          active && styles.optionRowActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionLabel,
                            active && styles.optionLabelActive,
                          ]}
                          numberOfLines={1}
                        >
                          {option.label}
                        </Text>
                        {active && (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color="#FFFFFF"
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.list}>
                {items.map((item, index) => (
                  <View key={item.key}>
                    <TouchableOpacity
                      activeOpacity={0.65}
                      onPress={() => {
                        if (item.options) return showLevel(item.key);
                        onClose();
                        item.onPress?.();
                      }}
                      style={styles.row}
                    >
                      <Ionicons
                        name={item.icon}
                        size={21}
                        color={item.danger ? "#DC2626" : "#1F2937"}
                        style={styles.icon}
                      />
                      <Text
                        style={[
                          styles.label,
                          item.danger && styles.labelDanger,
                        ]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>

                      {!!item.options && (
                        <View style={styles.valueWrap}>
                          {item.value !== undefined && (
                            <Text style={styles.value} numberOfLines={1}>
                              {item.options.find(
                                (o) => o.value === item.value
                              )?.label || item.value}
                            </Text>
                          )}
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color="#9CA3AF"
                          />
                        </View>
                      )}
                    </TouchableOpacity>

                    {item.divider && index < items.length - 1 && (
                      <View style={styles.divider} />
                    )}
                  </View>
                ))}
              </View>
            )}
          </Animated.View>
        </GlassSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    minWidth: 236,
    maxWidth: 300,
  },
  pinRight: {
    right: 12,
  },
  pinLeft: {
    left: 12,
  },
  card: {
    overflow: "hidden",
  },
  list: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  icon: {
    width: 28,
  },
  label: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    fontWeight: "500",
    marginLeft: 10,
  },
  labelDanger: {
    color: "#DC2626",
  },
  valueWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
    maxWidth: 110,
  },
  value: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
    marginRight: 4,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  backLabel: {
    color: "#2563EB",
    fontSize: 15,
    fontWeight: "800",
    marginLeft: 6,
  },
  options: {
    maxHeight: 300,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 2,
  },
  optionRowActive: {
    backgroundColor: "#2563EB",
  },
  optionLabel: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "500",
  },
  optionLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(15,23,42,0.12)",
    marginHorizontal: 4,
  },
});
