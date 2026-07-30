"use client";

import { useState } from "react";
import type { NotificationDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/datetime";
import { removeItem, replaceItem } from "@/lib/optimistic-list";
import { canPermanentlyDelete } from "@/lib/roles";
import { useLiveRevalidation } from "@/lib/use-live-revalidation";

export default function NotificationsPage() {
  const user = useAuth();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isDeletingRead, setIsDeletingRead] = useState(false);

  const { isInitialLoading, revalidate } = useLiveRevalidation({
    load: () => apiClient.notifications(),
    onData: (result) => {
      setItems(result.items);
      setError("");
    },
    onError: (caught) => setError(caught instanceof ApiClientError ? caught.message : "تعذر تحميل التذكيرات"),
    deps: []
  });

  async function markRead(id: string) {
    if (pendingId) return;
    const previous = items;
    setError("");
    setPendingId(id);
    const now = new Date().toISOString();
    setItems((current) => replaceItem(current, { ...current.find((item) => item.id === id)!, readAt: now }));
    try {
      const result = await apiClient.markNotificationRead(id);
      setItems((current) => replaceItem(current, result.notification));
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تعليم التذكير كمقروء");
    } finally {
      setPendingId(null);
    }
  }

  async function markAllRead() {
    if (isMarkingAll) return;
    const previous = items;
    setError("");
    setIsMarkingAll(true);
    const now = new Date().toISOString();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    try {
      await apiClient.markAllNotificationsRead();
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تعليم التذكيرات كمقروءة");
    } finally {
      setIsMarkingAll(false);
    }
  }

  async function deleteNotification(id: string) {
    if (!window.confirm("هل أنت متأكد من حذف الإشعار؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    const previous = items;
    setError("");
    setPendingId(id);
    setItems((current) => removeItem(current, id));
    try {
      await apiClient.deleteNotification(id);
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر حذف الإشعار");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteReadNotifications() {
    if (!window.confirm("هل أنت متأكد من حذف الإشعارات المقروءة؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    const previous = items;
    setError("");
    setIsDeletingRead(true);
    setItems((current) => current.filter((item) => !item.readAt));
    try {
      await apiClient.deleteReadNotifications();
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر حذف الإشعارات المقروءة");
    } finally {
      setIsDeletingRead(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">التذكيرات</h2>
        <div className="flex flex-wrap gap-2">
          <button disabled={isMarkingAll} onClick={() => void markAllRead()} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
            {isMarkingAll ? "جار التعليم..." : "تعليم الكل كمقروء"}
          </button>
          {canPermanentlyDelete(user.role) ? (
            <button disabled={isDeletingRead} onClick={() => void deleteReadNotifications()} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
              {isDeletingRead ? "جار الحذف..." : "حذف الإشعارات المقروءة"}
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 space-y-3">
        {isInitialLoading ? <p className="rounded-md bg-slate-100 p-4 text-sm text-slate-500">جار تحميل التذكيرات...</p> : null}
        {!isInitialLoading && items.length === 0 ? <p className="text-sm text-slate-500">لا توجد تذكيرات</p> : null}
        {items.map((item) => (
          <article key={item.id} className={item.readAt ? "rounded-md border border-slate-100 bg-slate-50 p-4" : "rounded-md border border-clinic-100 bg-clinic-50 p-4"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{item.title}</p>
                <p className="mt-1 text-sm text-slate-700">{item.message}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
              </div>
              {!item.readAt ? (
                <button disabled={pendingId === item.id || isMarkingAll} onClick={() => void markRead(item.id)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                  {pendingId === item.id ? "جار التعليم..." : "مقروء"}
                </button>
              ) : null}
              {canPermanentlyDelete(user.role) ? (
                <button disabled={pendingId === item.id || isDeletingRead} onClick={() => void deleteNotification(item.id)} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">حذف</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
