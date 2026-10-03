import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  GestureResponderEvent,
  Image,
  LayoutAnimation,
  LayoutAnimationConfig,
  PanResponder,
  PanResponderGestureState,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import GlassSurface from "./GlassSurface";

/**
 * ============================================================
 * PILL HEADER
 * ============================================================
 *
 * Telegram style floating top bar, built from liquid glass:
 *
 *   ( back )   [        Title   v        ]   ( menu )
 *
 * A long press on the title turns the title pill and the menu
 * circle into one wide search field, and the left circle becomes
 * the way out of it:
 *
 *   ( back )   [  Search ....................... ]
 */
export interface PillHeaderProps {
  title: string;
  onBack?: () => void;
  /** shown instead of the back arrow, e.g. the app logo */
  logo?: number;
  onTitlePress?: () => void;
  onTitleLongPress?: () => void;
  expanded?: boolean;
  onMenuPress?: () => void;
  menuOpen?: boolean;
  /** replaces the three dots, e.g. a bell on the dashboard */
  actionIcon?: keyof typeof Ionicons.glyphMap;
  /** unread count drawn on the action circle */
  actionBadge?: number;
  /** search mode */
  searching?: boolean;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (text: string) => void;
  onSearchClose?: () => void;
  /**
   * A notification that arrived while the app was open. The pill
   * stretches across the whole row to carry it, then settles back.
   * A new `id` restarts the animation, so two in a row both show.
   */
  banner?: { id: string; title: string; body: string } | null;
  onBannerPress?: () => void;
  /** fires when the banner has finished retracting */
  onBannerDone?: () => void;
}

const CIRCLE = 46;
const GAP = 8;

/** the corner on the notification banner, the one surface left */
const BOX_RADIUS = 14;

/** how long the banner stays at full width */
const BANNER_HOLD = 3000;

const SCREEN_HEIGHT = Dimensions.get("window").height;

/** how far, or how fast, a push UP has to be to take it away */
const SWIPE_DISTANCE = 40;
const SWIPE_VELOCITY = 0.3;

/**
 * How far down the banner will follow a finger pushing the wrong
 * way. It is dismissed upward only, so a downward drag is damped
 * to a hint of movement rather than tracking the finger — enough
 * to answer the touch, not enough to look like it might open.
 */
const DOWNWARD_RESISTANCE = 0.18;

/**
 * The header's layout changes, run natively. Spring rather than
 * linear so the pill settles into its new width instead of
 * arriving flat, and opacity for the views entering and leaving.
 */
const HEADER_TRANSITION: LayoutAnimationConfig = {
  duration: 300,
  create: {
    type: LayoutAnimation.Types.easeOut,
    property: LayoutAnimation.Properties.opacity,
    duration: 200,
    delay: 80,
  },
  update: {
    type: LayoutAnimation.Types.spring,
    springDamping: 0.85,
  },
  delete: {
    type: LayoutAnimation.Types.easeIn,
    property: LayoutAnimation.Properties.opacity,
    duration: 140,
  },
};

export default function PillHeader({
  title,
  onBack,
  logo,
  onTitlePress,
  onTitleLongPress,
  expanded = false,
  onMenuPress,
  menuOpen = false,
  actionIcon,
  actionBadge = 0,
  searching = false,
  searchValue = "",
  searchPlaceholder = "Search",
  onSearchChange,
  onSearchClose,
  banner = null,
  onBannerPress,
  onBannerDone,
}: PillHeaderProps) {
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (searching) {
      const t = setTimeout(() => input.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [searching]);

  /**
   * ============================================================
   * SEARCH TRANSITION
   * ============================================================
   *
   * Opening search drops the right circle and lets the pill take
   * the width. That is a layout change, so it is handed to the
   * platform: LayoutAnimation moves every affected view in one
   * native pass rather than one JavaScript frame at a time.
   *
   * Configured during render because the layout it describes is
   * the one this render commits.
   */
  /**
   * Everything that changes the header's shape: search opening,
   * the left circle turning from logo to back arrow, the right
   * one turning from menu to bell, and the badge coming or going.
   */
  const shape = [
    searching,
    !!onBack,
    actionIcon || "menu",
    actionBadge > 0,
  ].join("|");

  const lastShape = useRef(shape);

  if (lastShape.current !== shape) {
    LayoutAnimation.configureNext(HEADER_TRANSITION);
    lastShape.current = shape;
  }

  /** the title and the field cross over rather than cutting */
  const searchAnim = useRef(new Animated.Value(searching ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(searchAnim, {
      toValue: searching ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [searching, searchAnim]);

  const searchOpacity = searchAnim;

  const titleFade = searchAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  /**
   * ============================================================
   * BANNER ANIMATION
   * ============================================================
   *
   * 0 is the resting header, 1 is the banner at full width. The
   * banner is an overlay rather than a change of layout, so the
   * title and the two circles underneath never reflow.
   */
  const bannerAnim = useRef(new Animated.Value(0)).current;
  /** the push away, on its own node so the drivers never mix */
  const dragY = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = React.useState<PillHeaderProps["banner"]>(null);
  const doneRef = useRef(onBannerDone);
  doneRef.current = onBannerDone;

  /** guards the retract, so a swipe and the timer cannot both run it */
  const closing = useRef(false);

  const finish = useCallback(() => {
    setShown(null);
    dragY.setValue(0);
    bannerAnim.setValue(0);
    doneRef.current?.();
  }, [bannerAnim, dragY]);

  /** the timed retract, straight up the way it came */
  const retract = useCallback(() => {
    if (closing.current) return;
    closing.current = true;

    Animated.timing(bannerAnim, {
      toValue: 0,
      /** a shade longer than it was, since it now has the whole
       *  drop to climb back rather than six points */
      duration: 300,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished: done }) => {
      if (done) finish();
    });
  }, [bannerAnim, finish]);

  /**
   * Carried on out of the top, in the direction it was pushed.
   *
   * It only has to clear its own height and the inset above it,
   * not the screen: a full screen height of travel at this speed
   * would run on well after the banner had left view.
   */
  const throwUp = useCallback(
    (velocity: number) => {
      if (closing.current) return;
      closing.current = true;

      Animated.timing(dragY, {
        toValue: -Math.min(220, SCREEN_HEIGHT / 3),
        duration: Math.max(130, 240 - Math.abs(velocity) * 40),
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished: done }) => {
        if (done) finish();
      });
    },
    [dragY, finish]
  );

  useEffect(() => {
    if (!banner) return;

    closing.current = false;
    dragY.setValue(0);
    setShown(banner);

    /**
     * Falls fast and settles once. Under-damping it any further
     * gives a second bounce, which on a notification reads as the
     * thing wobbling rather than landing.
     */
    const entrance = Animated.spring(bannerAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 9,
      tension: 90,
    });

    entrance.start();

    /**
     * A plain timer rather than Animated.delay inside a sequence.
     * Animated.delay does not take a driver, so putting it between
     * two native-driven steps left the sequence stalled after the
     * entrance and the banner never retracted.
     */
    const timer = setTimeout(retract, BANNER_HOLD);

    return () => {
      entrance.stop();
      clearTimeout(timer);
    };
  }, [banner?.id]);

  /**
   * ============================================================
   * SWIPE TO DISMISS
   * ============================================================
   *
   * A push UP takes the banner away, out through the top, the
   * way it arrived. Anything short of the threshold springs back
   * and the timer, which was never cancelled, still closes it.
   *
   * A downward push is not a dismissal, so it is damped rather
   * than followed: the banner gives a little and returns.
   */
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) =>
        Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),

      onPanResponderMove: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        if (closing.current) return;

        dragY.setValue(
          gesture.dy < 0 ? gesture.dy : gesture.dy * DOWNWARD_RESISTANCE
        );
      },

      onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
        if (closing.current) return;

        /** upward only: negative dy, negative vy */
        const far = gesture.dy < -SWIPE_DISTANCE;
        const fast = gesture.vy < -SWIPE_VELOCITY;

        if (far || fast) {
          throwUp(gesture.vy);
          return;
        }

        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 7,
          tension: 90,
        }).start();
      },
    })
  ).current;

  /**
   * ============================================================
   * BELL WIGGLE
   * ============================================================
   *
   * The action circle shakes when the unread count goes up, so a
   * notification that arrived while the header was busy still
   * announces itself once the banner is out of the way.
   */
  const wiggle = useRef(new Animated.Value(0)).current;
  const lastBadge = useRef(actionBadge);

  useEffect(() => {
    const grew = actionBadge > lastBadge.current;
    lastBadge.current = actionBadge;

    if (!grew || !actionIcon) return;

    /** waits out the banner, which has the circles faded away */
    const timer = setTimeout(() => {
      wiggle.setValue(0);

      Animated.sequence([
        Animated.timing(wiggle, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(wiggle, {
          toValue: -1,
          duration: 130,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(wiggle, {
          toValue: 0.6,
          duration: 110,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(wiggle, {
          toValue: 0,
          useNativeDriver: true,
          friction: 4,
          tension: 140,
        }),
      ]).start();
    }, banner ? BANNER_HOLD + 320 : 0);

    return () => clearTimeout(timer);
  }, [actionBadge, actionIcon]);

  const wiggleRotate = wiggle.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-14deg", "14deg"],
  });

  /** the bell on the banner itself, shaken as the banner settles */
  const bannerBell = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!banner) return;

    bannerBell.setValue(0);

    /** lets the pill arrive first, so the two do not compete */
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(bannerBell, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bannerBell, {
          toValue: -1,
          duration: 130,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bannerBell, {
          toValue: 0.6,
          duration: 110,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(bannerBell, {
          toValue: 0,
          useNativeDriver: true,
          friction: 4,
          tension: 140,
        }),
      ]).start();
    }, 220);

    return () => clearTimeout(timer);
  }, [banner?.id, bannerBell]);

  const bannerBellRotate = bannerBell.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-16deg", "16deg"],
  });

  /**
   * It thins out on the way up rather than vanishing at the edge.
   *
   * Only the upward half fades: a downward nudge is a gesture the
   * banner refuses, and fading on it would suggest it was about
   * to go somewhere.
   */
  const dragFade = dragY.interpolate({
    inputRange: [-110, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  /**
   * Everything here is transform and opacity, so the whole thing
   * runs on the native driver. Animating the width instead would
   * mean resizing a BlurView every frame, which is what made an
   * earlier version of this stutter on Android.
   *
   * The circles draw in toward the centre and shrink away while
   * the wide pill rises in their place, so the three read as one
   * closing together.
   */
  const sideOpacity = bannerAnim.interpolate({
    inputRange: [0, 0.55],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const sideScale = bannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.35],
  });

  const leftShift = bannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (CIRCLE + GAP) / 2],
  });

  const rightShift = bannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -(CIRCLE + GAP) / 2],
  });

  /** the title steps aside for the notification, and back after */
  const titleOpacity = bannerAnim.interpolate({
    inputRange: [0, 0.4],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  /**
   * ============================================================
   * THE DROP FROM THE TOP
   * ============================================================
   *
   * The banner comes in over the header from off screen above it
   * and goes back the same way, the way a system notification
   * does. It used to fade up from six points below its resting
   * place, which read as appearing rather than arriving.
   *
   * The travel starts above the status bar, not just above the
   * row: the header sits below the inset, so clearing its own
   * height alone would still leave the banner sliding out of the
   * middle of the status bar.
   */
  const bannerDrop = bannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-(CIRCLE + 64), 0],
  });

  /**
   * Faded across the first part of the travel only, so it is
   * fully solid well before it settles. Carrying the fade all the
   * way to 1 makes the last of the movement look like a ghost
   * sliding into place.
   */
  const bannerOpacity = bannerAnim.interpolate({
    inputRange: [0, 0.45],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  /** a touch narrow on the way in, so the drop has some weight */
  const bannerScale = bannerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });


  return (
    <View style={styles.row}>
      {/* left control, folding away as the banner opens ---------- */}
      <Animated.View
        style={[
          styles.side,
          {
            opacity: sideOpacity,
            transform: [{ translateX: leftShift }, { scale: sideScale }],
          },
        ]}
        pointerEvents={shown ? "none" : "auto"}
      >
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={searching ? onSearchClose : onBack}
          disabled={!searching && !onBack}
          style={styles.iconButton}
        >
          {logo && !searching && !onBack ? (
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          ) : (
            <Ionicons name="arrow-back" size={24} color="#0F172A" />
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* the title, sitting straight beside the icon ------------- */}
      <Animated.View
        style={[styles.center, { opacity: titleOpacity }]}
        pointerEvents={shown ? "none" : "auto"}
      >
        {searching ? (
          <Animated.View
            style={[styles.searchInner, { opacity: searchOpacity }]}
          >
            <TextInput
              ref={input}
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder={searchPlaceholder}
              placeholderTextColor="#94A3B8"
              returnKeyType="search"
              style={styles.searchInput}
            />
            {searchValue.length > 0 && (
              <TouchableOpacity
                onPress={() => onSearchChange?.("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </Animated.View>
        ) : (
          <Animated.View style={[styles.center, { opacity: titleFade }]}>
            <TouchableOpacity
              activeOpacity={onTitlePress || onTitleLongPress ? 0.7 : 1}
              onPress={onTitlePress}
              onLongPress={onTitleLongPress}
              delayLongPress={280}
              style={styles.titleRow}
              
            >
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {!!onTitlePress && (
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#475569"
                  style={styles.caret}
                />
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>

      {/* right control, folding away with the left one ----------- */}
      {!searching && (
        <Animated.View
          style={[
            styles.side,
            {
              opacity: sideOpacity,
              transform: [{ translateX: rightShift }, { scale: sideScale }],
            },
          ]}
          pointerEvents={shown ? "none" : "auto"}
        >
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={onMenuPress}
            style={styles.iconButton}
          >
            <Animated.View style={{ transform: [{ rotate: wiggleRotate }] }}>
              <Ionicons
                name={actionIcon || "ellipsis-vertical"}
                size={actionIcon ? 24 : 22}
                color={menuOpen ? "#2563EB" : "#0F172A"}
              />
            </Animated.View>
          </TouchableOpacity>

          {actionBadge > 0 && (
            <View style={styles.badge} pointerEvents="none">
              <Text style={styles.badgeText}>
                {actionBadge > 99 ? "99+" : actionBadge}
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* the three closed into one, carrying the arrival ---------- */}
      {!!shown && (
        <Animated.View
          style={[
            styles.banner,
            { opacity: dragFade, transform: [{ translateY: dragY }] },
          ]}
          {...pan.panHandlers}
        >
          <Animated.View
            style={[
              styles.bannerSurface,
              {
                opacity: bannerOpacity,
                transform: [{ translateY: bannerDrop }, { scale: bannerScale }],
              },
            ]}
          >
          <TouchableOpacity
            activeOpacity={onBannerPress ? 0.75 : 1}
            onPress={onBannerPress}
            style={styles.bannerRow}
          >
            <View style={styles.bannerIcon}>
              <Animated.View
                style={{ transform: [{ rotate: bannerBellRotate }] }}
              >
                <Ionicons name="notifications" size={17} color="#FFFFFF" />
              </Animated.View>
            </View>

            {/**
             * The heading alone. The body is still carried on the
             * banner object and still reaches the notification
             * screen — it is just not read out here, where there
             * are three seconds and one line to work with.
             */}
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle} numberOfLines={1}>
                {shown.title}
              </Text>
            </View>
          </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: CIRCLE,
    paddingHorizontal: 6,
  },
  side: {
    justifyContent: "center",
  },
  /**
   * Bare icons with nothing drawn behind them, so the tap target
   * is the button's own padding: 44 square around a 24 icon.
   */
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * Deliberately not a GlassSurface. A blurred backdrop is costly
   * to composite while it moves, and this one is animating for its
   * whole life, so it is painted flat instead.
   */
  /** the drag node: position only, so its transform stays its own */
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    height: CIRCLE,
  },
  /**
   * Solid white, not translucent. This one is allowed its shadow
   * and its opacity: it is a card that arrives over the page and
   * has to be read at a glance, so the rules that keep the bars
   * see-through work against it here.
   */
  bannerSurface: {
    flex: 1,
    borderRadius: BOX_RADIUS,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(226,232,240,0.9)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  bannerRow: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    /** the icon and the text block share one vertical centre */
    alignItems: "center",
    paddingHorizontal: 10,
  },
  bannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  /**
   * Centred down the middle, left aligned across: the text sits
   * beside the bell rather than under it, and stays centred
   * whether it is one line or two.
   */
  bannerText: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  bannerTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "left",
  },
  center: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
  },
  /** left aligned, hard against the icon it belongs to */
  titleRow: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: 2,
    paddingRight: 8,
  },
  searchInner: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 2,
    paddingRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "500",
    height: "100%",
  },
  logo: {
    width: 30,
    height: 30,
  },
  title: {
    color: "#0F172A",
    fontSize: 21,
    fontWeight: "800",
    textAlign: "left",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  caret: {
    marginLeft: 6,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
});
