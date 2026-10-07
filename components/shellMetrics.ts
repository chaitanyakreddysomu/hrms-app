import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * ============================================================
 * SHELL METRICS
 * ============================================================
 *
 * The numbers the shell and its pages both need, kept out of
 * AppShell so a page can read them without importing the shell
 * that renders it.
 */

/**
 * The header's height below the status bar: 6 of padding above
 * the controls row, the 46 row itself, 6 below.
 */
export const BAR_HEIGHT = 58;

/**
 * How far a page's first content sits below the header.
 *
 * Pages fill the whole screen so their content passes behind the
 * header rather than starting under it, which is what lets the
 * bar be transparent: there has to be something up there to see
 * through to. That means nothing is reserving the space any more,
 * so each page's scroll CONTENT carries this padding instead.
 *
 * Content padding rather than view padding on purpose. Padding on
 * the ScrollView moves its top edge down, and a ScrollView clips
 * at its own edge, so scrolled text would be sliced along a hard
 * line below the bar. Padding on the content leaves the edge at
 * the top of the screen and simply starts the first item lower.
 */
export function useShellContentTop(extra: number = 0, hideHeader = false) {
  const insets = useSafeAreaInsets();

  return insets.top + (hideHeader ? 0 : BAR_HEIGHT) + extra;
}
