import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

const LOGO = require("../assets/ics-logo.png");

const LOGO_SIZE = 96;
const TEXT_WIDTH = 176;
const GAP = 14;

const SHIFT = (TEXT_WIDTH + GAP) / 2;
const HOLD_MS = 2600;

export default function SplashScreen({ navigation }: Props) {
  const screenOpacity = useRef(new Animated.Value(1)).current;

  // Logo animation
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;
  const logoShift = useRef(new Animated.Value(0)).current;

  // Text animations
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(22)).current;
  const textScale = useRef(new Animated.Value(0.94)).current;

  // Individual text animations
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(12)).current;

  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslate = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.sequence([
      /*
       * --------------------------------------------------------
       * 1. Logo enters
       * --------------------------------------------------------
       */
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),

      Animated.delay(180),

      /*
       * --------------------------------------------------------
       * 2. Logo moves left + text container appears
       * --------------------------------------------------------
       */
      Animated.parallel([
        Animated.timing(logoShift, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.parallel([
          Animated.timing(textOpacity, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),

          Animated.timing(textTranslate, {
            toValue: 0,
            duration: 600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),

          Animated.spring(textScale, {
            toValue: 1,
            friction: 8,
            tension: 55,
            useNativeDriver: true,
          }),
        ]),
      ]),

      /*
       * --------------------------------------------------------
       * 3. Title appears
       * --------------------------------------------------------
       */
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(titleTranslate, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),

      /*
       * --------------------------------------------------------
       * 4. Subtitle follows slightly later
       * --------------------------------------------------------
       */
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 450,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),

        Animated.timing(subtitleTranslate, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    /*
     * Navigate to login after splash animation.
     */
    const timer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 480,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        navigation.replace("Login");
      });
    }, HOLD_MS);

    return () => clearTimeout(timer);
  }, []);

  const logoTranslateX = logoShift.interpolate({
    inputRange: [0, 1],
    outputRange: [SHIFT, 0],
  });

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <StatusBar style="dark" />

      <View style={styles.row}>
        {/* -------------------------------------------------- */}
        {/* LOGO */}
        {/* -------------------------------------------------- */}
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [
              { translateX: logoTranslateX },
              { scale: logoScale },
            ],
          }}
        >
          <Image
            source={LOGO}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* -------------------------------------------------- */}
        {/* BRAND TEXT */}
        {/* -------------------------------------------------- */}
        <Animated.View
          style={[
            styles.textBlock,
            {
              opacity: textOpacity,
              transform: [
                { translateX: textTranslate },
                { scale: textScale },
              ],
            },
          ]}
        >
          {/* Title */}
          <Animated.Text
            style={[
              styles.title,
              {
                opacity: titleOpacity,
                transform: [
                  { translateY: titleTranslate },
                ],
              },
            ]}
          >
            ICS HRMS
          </Animated.Text>

          {/* Subtitle */}
          <Animated.Text
            style={[
              styles.subtitle,
              {
                opacity: subtitleOpacity,
                transform: [
                  { translateY: subtitleTranslate },
                ],
              },
            ]}
          >
            People · Payroll · Performance
          </Animated.Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },

  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },

  textBlock: {
    width: TEXT_WIDTH,
    marginLeft: GAP,
  },

  title: {
    color: "#0F172A",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 1,
  },

  subtitle: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginTop: 4,
  },
});
