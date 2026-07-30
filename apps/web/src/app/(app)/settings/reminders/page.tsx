"use client";

import { useState } from "react";
import type { ReminderDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/datetime";
import { removeItem } from "@/lib/optimistic-list";
import { useLiveRevalidation } from "@/lib/use-live-revalidation";

export default function RemindersSettingsPage() {
  const [items, setItems] = useState<ReminderDto[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { isInitialLoading, revalidate } = useLiveRevalidation({
    load: () => apiClient.reminders(),
    onData: (result) => {
      setItems(result.items);
      setError("");
    },
    onError: (caught) => setError(caught instanceof ApiClientError ? caught.message : "تعذر تحميل التذكيرات المجدولة"),
    deps: []
  });

  async function deleteReminder(id: string) {
    if (!window.confirm("هل أنت متأكد من حذف التذكير؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    const previous = items;
    setError("");
    setMessage("");
    setPendingId(id);
    setItems((current) => removeItem(current, id));
    try {
      await apiClient.deleteReminder(id);
      setMessage("تم حذف التذكير");
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر حذف التذكير");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">التذكيرات المجدولة</h2>
      {message ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-5 space-y-3">
        {isInitialLoading ? <p className="rounded-md bg-slate-100 p-4 text-sm text-slate-500">جار تحميل التذكيرات المجدولة...</p> : null}
        {!isInitialLoading && items.length === 0 ? <p className="text-sm text-slate-500">لا توجد تذكيرات مجدولة</p> : null}
        {items.map((item) => (
          <article key={item.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">
                  {item.appointment ? `${item.appointment.patient.firstName} ${item.appointment.patient.lastName} مع الدكتور ${item.appointment.doctor.fullName}` : "تذكير غير مرتبط بموعد"}
                </p>
                <p className="mt-1 text-sm text-slate-600">الحالة: {item.status} - موعد التذكير: {formatDateTime(item.scheduledFor)}</p>
              </div>
              <button disabled={pendingId === item.id} onClick={() => void deleteReminder(item.id)} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
                {pendingId === item.id ? "جار الحذف..." : "حذف"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
