import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";

import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import GlassSurface from "./GlassSurface";

export interface PillTab {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  imageUri?: string;
}

interface Props {
  tabs: PillTab[];
  activeKey: string;
  onChange: (key: string) => void;
  onLongPress?: (key: string) => void;
  bottomInset?: number;
  /** what the bar's glass blurs on Android, see GlassSurface */
  blurTarget?: RefObject<View | null>;
}

const ACTIVE = "#007AFF";
const INACTIVE = "#64748B";

const PILL_WIDTH = 64;

const BAR_PADDING = 6;

const LONG_PRESS_DELAY = 350;

/*
 * Kept for the animation.
 *
 * There is NO visible pill anymore.
 */
const LONG_PRESS_SCALE = 1.08;

export default function PillTabBar({
  tabs,
  activeKey,
  onChange,
  onLongPress,
  bottomInset = 0,
  blurTarget,
}: Props) {
  /*
   * ============================================================
   * REAL ACTIVE INDEX
   * ============================================================
   */

  const activeIndex = Math.max(
    0,
    tabs.findIndex(
      (tab) => tab.key === activeKey
    )
  );

  /*
   * ============================================================
   * VISUAL INDEX
   * ============================================================
   */

  const [visualIndex, setVisualIndex] =
    useState(activeIndex);

  const [barWidth, setBarWidth] =
    useState(0);

  /*
   * ============================================================
   * ANIMATED POSITION
   * ============================================================
   */

  const pillX = useRef(
    new Animated.Value(0)
  ).current;

  /*
   * This is now only a very subtle content
   * animation because the liquid background
   * has been removed.
   */

  const activeScale = useRef(
    new Animated.Value(1)
  ).current;

  /*
   * ============================================================
   * TOUCH STATE
   * ============================================================
   */

  const currentIndex =
    useRef(activeIndex);

  const dragging =
    useRef(false);

  const longPressed =
    useRef(false);

  const timer =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const barRef =
    useRef<View>(null);

  const barScreenX =
    useRef(0);

  const startPageX =
    useRef(0);

  /*
   * ============================================================
   * SLOT WIDTH
   * ============================================================
   */

  const innerWidth = Math.max(
    0,
    barWidth -
      BAR_PADDING * 2
  );

  const slotWidth =
    tabs.length > 0
      ? innerWidth / tabs.length
      : 0;

  /*
   * ============================================================
   * TAB CENTER
   * ============================================================
   */

  const getTabCenter = (
    index: number
  ) => {
    return (
      BAR_PADDING +
      index * slotWidth +
      slotWidth / 2
    );
  };

  /*
   * ============================================================
   * CONTENT X
   * ============================================================
   */

  const getPillX = (
    index: number
  ) => {
    return (
      getTabCenter(index) -
      PILL_WIDTH / 2
    );
  };

  /*
   * ============================================================
   * CLEAR TIMER
   * ============================================================
   */

  const clearLongPress = () => {
    if (timer.current) {
      clearTimeout(
        timer.current
      );

      timer.current = null;
    }
  };

  /*
   * ============================================================
   * MEASURE BAR
   * ============================================================
   */

  const measureBar = () => {
    barRef.current?.measureInWindow(
      (x) => {
        barScreenX.current = x;
      }
    );
  };

  /*
   * ============================================================
   * MOVE TO TAB
   * ============================================================
   */

  const animateToTab = (
    index: number
  ) => {
    if (slotWidth <= 0) {
      return;
    }

    Animated.spring(pillX, {
      toValue: getPillX(index),

      friction: 8,
      tension: 80,

      useNativeDriver: true,
    }).start();
  };

  /*
   * ============================================================
   * ACTIVE KEY CHANGED
   * ============================================================
   */

  useEffect(() => {
    if (dragging.current) {
      return;
    }

    currentIndex.current =
      activeIndex;

    setVisualIndex(
      activeIndex
    );

    animateToTab(
      activeIndex
    );
  }, [
    activeIndex,
    slotWidth,
  ]);

  /*
   * ============================================================
   * INITIAL POSITION
   * ============================================================
   */

  useEffect(() => {
    if (
      barWidth <= 0 ||
      slotWidth <= 0
    ) {
      return;
    }

    pillX.stopAnimation();

    pillX.setValue(
      getPillX(activeIndex)
    );
  }, [
    barWidth,
    slotWidth,
  ]);

  /*
   * ============================================================
   * START TOUCH
   * ============================================================
   */

  const startTouch = (
    index: number,
    pageX: number
  ) => {
    startPageX.current =
      pageX;

    currentIndex.current =
      index;

    /*
     * Immediately show this tab's
     * icon + text.
     */

    setVisualIndex(index);

    /*
     * Put content at pressed tab.
     */

    if (slotWidth > 0) {
      pillX.stopAnimation();

      pillX.setValue(
        getPillX(index)
      );
    }

    measureBar();

    clearLongPress();

    /*
     * ==========================================================
     * LONG PRESS
     * ==========================================================
     */

    timer.current =
      setTimeout(() => {
        longPressed.current =
          true;

        dragging.current =
          true;

        setVisualIndex(index);

        /*
         * Tell parent.
         */

        if (
          tabs[index].key !==
          activeKey
        ) {
          onChange(
            tabs[index].key
          );
        }

        onLongPress?.(
          tabs[index].key
        );

        /*
         * ======================================================
         * SUBTLE ACTIVE ANIMATION
         * ======================================================
         *
         * There is NO visible pill.
         *
         * Only the active content gets
         * a very subtle spring.
         */

        Animated.spring(
          activeScale,
          {
            toValue:
              LONG_PRESS_SCALE,

            friction: 7,
            tension: 110,

            useNativeDriver: true,
          }
        ).start();
      }, LONG_PRESS_DELAY);
  };

  /*
   * ============================================================
   * MOVE
   * ============================================================
   */

  const moveTouch = (
    pageX: number
  ) => {
    /*
     * Before long press.
     */

    if (!longPressed.current) {
      const distance =
        Math.abs(
          pageX -
            startPageX.current
        );

      if (distance > 10) {
        clearLongPress();
      }

      return;
    }

    if (
      !dragging.current ||
      slotWidth <= 0
    ) {
      return;
    }

    /*
     * Screen X → bar X
     */

    const localX =
      pageX -
      barScreenX.current;

    /*
     * Keep inside bar.
     */

    const clampedX = Math.max(
      BAR_PADDING,
      Math.min(
        barWidth - BAR_PADDING,
        localX
      )
    );

    /*
     * Move active content.
     *
     * This is still the same smooth
     * spring-style movement system.
     */

    pillX.setValue(
      clampedX -
        PILL_WIDTH / 2
    );

    /*
     * Find tab under finger.
     */

    const relativeX =
      clampedX -
      BAR_PADDING;

    let newIndex =
      Math.floor(
        relativeX /
          slotWidth
      );

    newIndex = Math.max(
      0,
      Math.min(
        tabs.length - 1,
        newIndex
      )
    );

    /*
     * ==========================================================
     * NEW TAB
     * ==========================================================
     */

    if (
      newIndex !==
      currentIndex.current
    ) {
      currentIndex.current =
        newIndex;

      /*
       * Change icon + label.
       */

      setVisualIndex(
        newIndex
      );

      /*
       * Tell parent.
       */

      onChange(
        tabs[newIndex].key
      );

      /*
       * Small spring animation.
       *
       * No visible pill.
       */

      Animated.sequence([
        Animated.spring(
          activeScale,
          {
            toValue: 1.12,

            friction: 6,
            tension: 140,

            useNativeDriver: true,
          }
        ),

        Animated.spring(
          activeScale,
          {
            toValue:
              LONG_PRESS_SCALE,

            friction: 7,
            tension: 110,

            useNativeDriver: true,
          }
        ),
      ]).start();
    }
  };

  /*
   * ============================================================
   * RELEASE
   * ============================================================
   */

  const endTouch = () => {
    clearLongPress();

    /*
     * Normal tap.
     */

    if (!longPressed.current) {
      return;
    }

    dragging.current =
      false;

    longPressed.current =
      false;

    const finalIndex =
      currentIndex.current;

    /*
     * Return content to normal size.
     */

    Animated.spring(
      activeScale,
      {
        toValue: 1,

        friction: 7,
        tension: 90,

        useNativeDriver: true,
      }
    ).start();

    /*
     * Snap to exact tab.
     */

    Animated.spring(
      pillX,
      {
        toValue:
          getPillX(finalIndex),

        friction: 8,
        tension: 75,

        useNativeDriver: true,
      }
    ).start();

    setVisualIndex(
      finalIndex
    );
  };

  /*
   * ============================================================
   * CANCEL
   * ============================================================
   */

  const cancelTouch = () => {
    clearLongPress();

    if (!longPressed.current) {
      return;
    }

    dragging.current =
      false;

    longPressed.current =
      false;

    const finalIndex =
      currentIndex.current;

    Animated.parallel([
      Animated.spring(
        activeScale,
        {
          toValue: 1,

          friction: 7,
          tension: 90,

          useNativeDriver: true,
        }
      ),

      Animated.spring(
        pillX,
        {
          toValue:
            getPillX(finalIndex),

          friction: 8,
          tension: 75,

          useNativeDriver: true,
        }
      ),
    ]).start();

    setVisualIndex(
      finalIndex
    );
  };

  /*
   * ============================================================
   * CLEANUP
   * ============================================================
   */

  useEffect(() => {
    return () => {
      clearLongPress();
    };
  }, []);

  /*
   * ============================================================
   * VISUAL TAB
   * ============================================================
   */

  const visualTab =
    tabs[visualIndex] ??
    tabs[activeIndex] ??
    tabs[0];

  if (!visualTab) {
    return null;
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingBottom:
            Math.max(
              bottomInset,
              14
            ),
        },
      ]}
      pointerEvents="box-none"
    >
      <GlassSurface
        radius={34}
        intensity={55}
        elevated={false}
        specular={false}
        rim={true}
        blurTarget={blurTarget}
        style={styles.bar}
      >
        <View
          ref={barRef}
          style={styles.barInner}
          onLayout={(event) => {
            setBarWidth(
              event.nativeEvent.layout.width
            );

            requestAnimationFrame(
              measureBar
            );
          }}
        >
          {/*
           * =====================================================
           * ACTIVE CONTENT
           * =====================================================
           *
           * NO LIQUID PILL.
           *
           * No white background.
           * No border.
           * No shadow.
           *
           * Only the icon + label move.
           */}

          <Animated.View
            pointerEvents="none"
            style={[
              styles.activeContent,
              {
                transform: [
                  {
                    translateX: pillX,
                  },

                  /*
                   * Very subtle press animation.
                   *
                   * This does NOT shrink the icon.
                   */
                  {
                    scale: activeScale,
                  },
                ],
              },
            ]}
          >
            {visualTab.imageUri ? (
              <View
                style={
                  styles.activeAvatar
                }
              >
                <Image
                  source={{
                    uri:
                      visualTab.imageUri,
                  }}
                  style={
                    styles.avatar
                  }
                />
              </View>
            ) : (
              <Ionicons
                name={
                  visualTab.activeIcon
                }
                size={22}
                color={ACTIVE}
              />
            )}

            <Text
              style={
                styles.activeLabel
              }
              numberOfLines={1}
            >
              {visualTab.label}
            </Text>
          </Animated.View>

          {/*
           * =====================================================
           * TABS
           * =====================================================
           */}

          {tabs.map(
            (tab, index) => {
              const isActive =
                index ===
                visualIndex;

              return (
                <View
                  key={tab.key}
                  style={styles.item}
                  onStartShouldSetResponder={() =>
                    true
                  }
                  onResponderGrant={(
                    event
                  ) => {
                    startTouch(
                      index,
                      event.nativeEvent
                        .pageX
                    );
                  }}
                  onResponderMove={(
                    event
                  ) => {
                    moveTouch(
                      event.nativeEvent
                        .pageX
                    );
                  }}
                  onResponderRelease={() => {
                    const wasLongPressed =
                      longPressed.current;

                    endTouch();

                    /*
                     * Normal tap.
                     */

                    if (
                      !wasLongPressed
                    ) {
                      onChange(
                        tab.key
                      );
                    }
                  }}
                  onResponderTerminate={
                    cancelTouch
                  }
                >
                  {!isActive && (
                    <View
                      style={
                        styles.inactiveContent
                      }
                    >
                      <View
                        style={
                          styles.iconWrap
                        }
                      >
                        {tab.imageUri ? (
                          <View
                            style={
                              styles.avatarContainer
                            }
                          >
                            <Image
                              source={{
                                uri:
                                  tab.imageUri,
                              }}
                              style={
                                styles.avatar
                              }
                            />
                          </View>
                        ) : (
                          <Ionicons
                            name={
                              tab.icon
                            }
                            size={22}
                            color={
                              INACTIVE
                            }
                          />
                        )}
                      </View>

                      <Text
                        style={
                          styles.label
                        }
                        numberOfLines={1}
                      >
                        {tab.label}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }
          )}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * ============================================================
   * OUTER
   * ============================================================
   */

  wrap: {
    position: "absolute",

    left: 0,
    right: 0,
    bottom: 0,

    alignItems: "center",

    paddingHorizontal: 14,
  },

  /*
   * ============================================================
   * MAIN GLASS BAR
   * ============================================================
   */

  bar: {
    width: "100%",
    height: 70,
  },

  barInner: {
    flex: 1,

    width: "100%",

    flexDirection: "row",

    alignItems: "center",

    position: "relative",

    paddingHorizontal:
      BAR_PADDING,
  },

  /*
   * ============================================================
   * ACTIVE CONTENT
   * ============================================================
   *
   * There is NO active background here.
   */

  activeContent: {
    position: "absolute",

    left: 0,
    top: 0,

    width: PILL_WIDTH,
    height: 70,

    alignItems: "center",

    justifyContent: "center",

    zIndex: 200,
  },

  activeLabel: {
    marginTop: 2,

    fontSize: 10,

    fontWeight: "700",

    color: ACTIVE,

    textAlign: "center",

    includeFontPadding: false,
  },

  /*
   * ============================================================
   * INACTIVE
   * ============================================================
   */

  item: {
    flex: 1,

    height: "100%",

    alignItems: "center",

    justifyContent: "center",

    zIndex: 10,
  },

  inactiveContent: {
    alignItems: "center",

    justifyContent: "center",
  },

  iconWrap: {
    width: 28,
    height: 28,

    alignItems: "center",

    justifyContent: "center",
  },

  label: {
    marginTop: 2,

    fontSize: 10,

    fontWeight: "600",

    color: INACTIVE,

    textAlign: "center",

    includeFontPadding: false,
  },

  /*
   * ============================================================
   * AVATAR
   * ============================================================
   */

  activeAvatar: {
    width: 28,
    height: 28,

    borderRadius: 14,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 1.5,

    borderColor:
      "rgba(0,122,255,0.40)",
  },

  avatarContainer: {
    width: 28,
    height: 28,

    borderRadius: 14,

    alignItems: "center",

    justifyContent: "center",

    backgroundColor:
      "rgba(255,255,255,0.08)",
  },

  avatar: {
    width: 26,
    height: 26,

    borderRadius: 13,
  },
});