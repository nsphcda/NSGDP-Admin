"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/hooks/useNotifications";
import { playNotificationSound } from "@/lib/utils/notification-sound";

export function NotificationBell({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { data } = useNotifications(1, 1, true);
  const unreadCount = data?.meta.total ?? 0;
  const countLoaded = data !== undefined;

  // Chime when unread count rises, never for the first real value, so opening the
  // app with existing unread notifications stays silent. Until the count has loaded
  // it reads as 0, which must not count as the first value (the real number would
  // then look like a rise).
  const previousUnread = useRef<number | null>(null);
  useEffect(() => {
    if (!countLoaded) return;
    if (previousUnread.current !== null && unreadCount > previousUnread.current) {
      playNotificationSound();
    }
    previousUnread.current = unreadCount;
  }, [countLoaded, unreadCount]);

  return (
    <Link
      href="/notifications"
      onClick={onNavigate}
      className="relative flex size-9 items-center justify-center rounded-md hover:bg-muted transition-colors"
      aria-label={`Notifications (${unreadCount} unread)`}
      title="Notifications"
    >
      <Bell className="size-4" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white leading-none">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
