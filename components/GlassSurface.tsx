import React from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

/**
 * ============================================================
 * LIQUID GLASS SURFACE
 * ============================================================
 *
 * iOS-style liquid glass material for BOTH iOS and Android.
 *
 * The important rule:
 *
 *        BACKGROUND
 *             ↓
 *        BlurView
 *             ↓
 *      subtle glass tint
 *             ↓
 *       glass highlights
 *             ↓
 *          rim
 *             ↓
 *          CONTENT
 *
 * Android does NOT get a heavier white fallback.
 *
 * This keeps Android visually close to the iOS version.
 */

interface Props {
  style?: StyleProp<ViewStyle>;

  /** Corner radius */
  radius: number;

  children: React.ReactNode;

  /**
   * Blur amount.
   *
   * 0 - 100
   *
   * 45 is a good iOS-style starting point.
   */
  intensity?: number;

  /**
   * Adds a soft shadow.
   *
   * For very transparent floating controls,
   * false usually looks more like iOS.
   */
  elevated?: boolean;

  /**
   * Adds a curved glass highlight.
   *
   * Good for circles and small pills.
   */
  specular?: boolean;

  /**
   * Adds the thin illuminated glass edge.
   */
  rim?: boolean;
}

export default function GlassSurface({
  style,
  radius,
  children,
  intensity = 45,
  elevated = false,
  specular = true,
  rim = true,
}: Props) {
  return (
    <View
      style={[
        styles.container,
        { borderRadius: radius },
        elevated && styles.shadow,
        style,
      ]}
    >
      {/* ======================================================
          GLASS BACKGROUND
          ====================================================== */}

      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.clip,
          { borderRadius: radius },
        ]}
      >
        {/* ----------------------------------------------------
            REAL BACKGROUND BLUR

            IMPORTANT:
            Android ALSO uses BlurView.

            This is what makes Android look like the
            iOS version instead of a translucent white box.
            ---------------------------------------------------- */}

        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={intensity}
          tint="light"
          experimentalBlurMethod={
            Platform.OS === "android"
              ? "dimezisBlurView"
              : undefined
          }
        />

        {/* ----------------------------------------------------
            VERY LIGHT GLASS TINT

            Do NOT increase this too much.

            0.07 keeps the background visible.
            ---------------------------------------------------- */}

        <View
          style={[
            StyleSheet.absoluteFill,
            styles.tint,
          ]}
        />

        {/* ----------------------------------------------------
            SOFT TOP LIGHT

            This creates the subtle bright reflection
            seen on glass surfaces.
            ---------------------------------------------------- */}

        <LinearGradient
          colors={[
            "rgba(255,255,255,0.20)",
            "rgba(255,255,255,0.08)",
            "rgba(255,255,255,0.025)",
            "rgba(255,255,255,0)",
          ]}
          locations={[
            0,
            0.22,
            0.48,
            0.78,
          ]}
          start={{
            x: 0.15,
            y: 0,
          }}
          end={{
            x: 0.85,
            y: 1,
          }}
          style={StyleSheet.absoluteFill}
        />

        {/* ----------------------------------------------------
            COOL LOWER REFLECTION

            Very subtle blue reflection gives the surface
            the "liquid" feeling without becoming blue.
            ---------------------------------------------------- */}

        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(225,238,255,0.025)",
            "rgba(205,225,255,0.07)",
          ]}
          locations={[
            0,
            0.65,
            1,
          ]}
          start={{
            x: 0.25,
            y: 0,
          }}
          end={{
            x: 0.75,
            y: 1,
          }}
          style={StyleSheet.absoluteFill}
        />

        {/* ====================================================
            SPECULAR / CURVED GLASS LIGHT
            ==================================================== */}

        {specular && (
          <>
            {/* ------------------------------------------------
                TOP CATCH LIGHT
                ------------------------------------------------ */}

            <LinearGradient
              colors={[
                "rgba(255,255,255,0.30)",
                "rgba(255,255,255,0.12)",
                "rgba(255,255,255,0)",
              ]}
              locations={[
                0,
                0.38,
                1,
              ]}
              start={{
                x: 0.25,
                y: 0,
              }}
              end={{
                x: 0.65,
                y: 1,
              }}
              style={[
                styles.catchLight,
                {
                  borderRadius: radius,
                  height: radius * 0.85,
                },
              ]}
            />

            {/* ------------------------------------------------
                LOWER REFRACTION
                ------------------------------------------------ */}

            <LinearGradient
              colors={[
                "rgba(170,205,255,0)",
                "rgba(190,220,255,0.035)",
                "rgba(210,232,255,0.10)",
              ]}
              locations={[
                0,
                0.55,
                1,
              ]}
              start={{
                x: 0.25,
                y: 0,
              }}
              end={{
                x: 0.75,
                y: 1,
              }}
              style={[
                styles.refraction,
                {
                  borderRadius: radius,
                  height: radius * 0.55,
                },
              ]}
            />
          </>
        )}

        {/* ====================================================
            GLASS RIM
            ==================================================== */}

        {rim && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.rim,
              {
                borderRadius: radius,
              },
            ]}
          />
        )}

        {/* ====================================================
            VERY SUBTLE INNER WHITE EDGE
            ==================================================== */}

        {rim && (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.innerRim,
              {
                borderRadius: Math.max(radius - 1, 0),
              },
            ]}
          />
        )}
      </View>

      {/* ======================================================
          CONTENT
          ====================================================== */}

      {children}
    </View>
  );
}

/**
 * ============================================================
 * STYLES
 * ============================================================
 */

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },

  /**
   * Clips BlurView, gradients and highlights to the
   * rounded glass shape.
   */
  clip: {
    overflow: "hidden",
  },

  /**
   * VERY IMPORTANT:
   *
   * Same tint on Android and iOS.
   *
   * Do not use a heavier Android fallback.
   */
  tint: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },

  /**
   * Curved top highlight.
   */
  catchLight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },

  /**
   * Lower cool reflection.
   */
  refraction: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },

  /**
   * Main glass edge.
   */
  rim: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },

  /**
   * Very subtle inner edge.
   */
  innerRim: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },

  /**
   * Soft floating shadow.
   */
  shadow: {
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.08,
    shadowRadius: 20,

    elevation: 5,
  },
});