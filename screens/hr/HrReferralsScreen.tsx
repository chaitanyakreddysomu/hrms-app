import React from "react";

import AdminReferralsScreen from "../admin/AdminReferralsScreen";

/**
 * ============================================================
 * REFERRALS
 * ============================================================
 *
 * The referral routes are role neutral: GET /api/referrals and
 * PATCH /api/referrals/:id answer HR exactly as they answer an
 * admin. So HR gets the admin screen itself rather than a second
 * copy of it, embedded in the shell the same way.
 */
interface Props {
  navigation?: any;
}

export default function HrReferralsScreen({ navigation }: Props) {
  return (
    <AdminReferralsScreen
      embedded
      navigation={
        navigation ||
        ({
          goBack: () => {},
          canGoBack: () => false,
        } as any)
      }
      route={{ key: "embedded", name: "embedded", params: undefined } as any}
    />
  );
}
