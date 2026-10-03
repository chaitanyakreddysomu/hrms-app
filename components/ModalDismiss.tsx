import React from "react";
import { Pressable, StyleSheet } from "react-native";

/**
 * ============================================================
 * MODAL DISMISS
 * ============================================================
 *
 * The tap target for the dimmed area around a sheet. Dropped in
 * as the first child of a modal backdrop, it fills the backdrop
 * and sits behind the sheet, so a tap on the dark part closes
 * the modal while taps on the sheet itself are unaffected.
 *
 *   <View style={backdrop}>
 *     <ModalDismiss onPress={close} />
 *     <View style={sheet}>...</View>
 *   </View>
 *
 * Pass the same handler the modal already gives `onRequestClose`,
 * so the dark area and the Android back button agree.
 */
export default function ModalDismiss({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Close"
    />
  );
}
