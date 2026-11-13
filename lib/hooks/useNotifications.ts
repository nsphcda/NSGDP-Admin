import { useEffect, useRef } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { playNotificationSound } from '../utils/notification-sound';
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../api/notifications';

/**
 * Hook to fetch notifications with pagination
 */
export function useNotifications(page = 1, limit = 20, unreadOnly = false) {
  return useQuery({
    queryKey: ['notifications', page, limit, unreadOnly],
    queryFn: () => getNotifications(page, limit, unreadOnly),
    refetchInterval: 30_000, // near-live unread count / bell dropdown
    placeholderData: keepPreviousData,
  });
}

/**
 * Plays the chime for a new notification that is marked as worth one (data.chime).
 *
 * Every notification still shows in the bell; only the important ones, the ones an admin
 * may be waiting on or must act on, carry the flag and make a sound. It watches the latest
 * unread notifications and chimes for any id it has not seen before. The first load only
 * records what is already there, so opening the app with unread notifications stays silent.
 */
export function useNotificationChime() {
  const { data } = useQuery({
    queryKey: ['notifications', 'chime-watch'],
    queryFn: () => getNotifications(1, 20, true),
    refetchInterval: 30_000,
  });
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    const latest = data.data ?? [];
    if (seen.current === null) {
      seen.current = new Set(latest.map((n) => n.id));
      return;
    }
    const fresh = latest.filter((n) => !seen.current!.has(n.id));
    if (fresh.some((n) => n.data?.chime === true)) playNotificationSound();
    fresh.forEach((n) => seen.current!.add(n.id));
  }, [data]);
}

/**
 * Hook to mark a single notification as read
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => {
      // Invalidate and refetch notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    },
  });
}

/**
 * Hook to mark all notifications as read
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => markAllNotificationsAsRead(),
    onSuccess: () => {
      // Invalidate and refetch notifications
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    },
  });
}
