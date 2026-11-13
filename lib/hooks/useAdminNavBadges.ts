"use client";

import { useQueries } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useAdminAccess } from "@/lib/hooks/useAdminAccess";
import { useStaggerStep } from "@/lib/hooks/useStaggeredEnable";
import {
  fetchAccessRequestsBadgeCount,
  fetchArchiveRequestsBadgeCount,
  fetchContactMessagesBadgeCount,
  fetchDatasetReviewBadgeCount,
  fetchDocumentReviewBadgeCount,
  fetchPartnerInterestBadgeCount,
} from "@/lib/api/nav-badges";

const BADGE_STALE_MS = 60_000;
/** Gap between the first requests of the six badges, so they do not all hit at once. */
const BADGE_STAGGER_MS = 450;

export type AdminNavBadgeKey =
  | "datasetReviewQueue"
  | "documentReviewQueue"
  | "accessRequests"
  | "archiveRequests"
  | "partnerInterest"
  | "contactMessages";

export type AdminNavBadgeCounts = Partial<Record<AdminNavBadgeKey, number>>;

export function useAdminNavBadges(): {
  counts: AdminNavBadgeCounts;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const { can, canAny } = useAdminAccess();
  const isSuperAdmin = user?.role === "super_admin";

  const canDatasetQueueValidate = isSuperAdmin || can("validate:datasets");
  const canDatasetQueueApprove = isSuperAdmin || can("approve:datasets");
  const canDatasetQueue =
    canDatasetQueueValidate || canDatasetQueueApprove || isSuperAdmin || can("publish:datasets");
  const canDocumentQueue = isSuperAdmin || can("manage:documents");
  const canAccessRequests =
    isSuperAdmin || canAny("view:access-requests", "approve:access-requests");
  const canArchiveRequests = isSuperAdmin;
  const canPartnerInterest =
    isSuperAdmin || canAny("view:partner-interest", "review:partner-interest");
  const canContact =
    isSuperAdmin || canAny("view:contact-messages", "review:contact-messages");

  const step = useStaggerStep(6, BADGE_STAGGER_MS);

  const results = useQueries({
    queries: [
      {
        queryKey: [
          "admin-nav-badge",
          "datasetReviewQueue",
          canDatasetQueueValidate,
          canDatasetQueueApprove,
        ],
        queryFn: () =>
          fetchDatasetReviewBadgeCount({
            includeValidatorCounts: canDatasetQueueValidate,
            includeApproverCount: canDatasetQueueApprove,
          }),
        enabled: canDatasetQueue && step > 0,
        staleTime: BADGE_STALE_MS,
        refetchInterval: BADGE_STALE_MS,
      },
      {
        queryKey: ["admin-nav-badge", "documentReviewQueue"],
        queryFn: fetchDocumentReviewBadgeCount,
        enabled: canDocumentQueue && step > 1,
        staleTime: BADGE_STALE_MS,
        refetchInterval: BADGE_STALE_MS,
      },
      {
        queryKey: ["admin-nav-badge", "accessRequests"],
        queryFn: fetchAccessRequestsBadgeCount,
        enabled: canAccessRequests && step > 2,
        staleTime: BADGE_STALE_MS,
        refetchInterval: BADGE_STALE_MS,
      },
      {
        queryKey: ["admin-nav-badge", "archiveRequests"],
        queryFn: fetchArchiveRequestsBadgeCount,
        enabled: canArchiveRequests && step > 3,
        staleTime: BADGE_STALE_MS,
        refetchInterval: BADGE_STALE_MS,
      },
      {
        queryKey: ["admin-nav-badge", "partnerInterest"],
        queryFn: fetchPartnerInterestBadgeCount,
        enabled: canPartnerInterest && step > 4,
        staleTime: BADGE_STALE_MS,
        refetchInterval: BADGE_STALE_MS,
      },
      {
        queryKey: ["admin-nav-badge", "contactMessages"],
        queryFn: fetchContactMessagesBadgeCount,
        enabled: canContact && step > 5,
        staleTime: BADGE_STALE_MS,
        refetchInterval: BADGE_STALE_MS,
      },
    ],
  });

  const counts: AdminNavBadgeCounts = {};
  if (canDatasetQueue && (results[0].data ?? 0) > 0) {
    counts.datasetReviewQueue = results[0].data;
  }
  if (canDocumentQueue && (results[1].data ?? 0) > 0) {
    counts.documentReviewQueue = results[1].data;
  }
  if (canAccessRequests && (results[2].data ?? 0) > 0) {
    counts.accessRequests = results[2].data;
  }
  if (canArchiveRequests && (results[3].data ?? 0) > 0) {
    counts.archiveRequests = results[3].data;
  }
  if (canPartnerInterest && (results[4].data ?? 0) > 0) {
    counts.partnerInterest = results[4].data;
  }
  if (canContact && (results[5].data ?? 0) > 0) {
    counts.contactMessages = results[5].data;
  }

  return {
    counts,
    isLoading: results.some((q) => q.isLoading),
  };
}
