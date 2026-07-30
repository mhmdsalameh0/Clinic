"use client";

import { Bell, CalendarClock, CalendarDays, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppointmentDto } from "@/lib/api-client";
import { apiClient } from "@/lib/api-client";
import { formatDateTime, formatTime } from "@/lib/datetime";

export default function DashboardPage() {
  const [today, setToday] = useState<AppointmentDto[]>([]);
  const [tomorrow, setTomorrow] = useState<AppointmentDto[]>([]);
  const [next, setNext] = useState<AppointmentDto | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    async function load() {
      const [todayResult, tomorrowResult, nextResult, unreadResult] = await Promise.all([
        apiClient.todayAppointments(),
        apiClient.tomorrowAppointments(),
        apiClient.nextAppointment(),
        apiClient.unreadCount().catch(() => ({ count: 0 }))
      ]);
      setToday(todayResult.items);
      setTomorrow(tomorrowResult.items);
      setNext(nextResult.appointment);
      setUnread(unreadResult.count);
    }
    void load();
  }, []);

  const stats = [
    { label: "مواعيد اليوم", value: today.length, icon: CalendarDays },
    { label: "مواعيد الغد", value: tomorrow.length, icon: CalendarClock },
    { label: "أقرب موعد", value: next ? formatTime(next.startAt) : "-", icon: Clock },
    { label: "تذكيرات غير مقروءة", value: unread, icon: Bell }
  ];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold text-slate-950">لوحة التحكم</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">كل ما يحتاجه موظف العيادة لمعرفة مواعيد اليوم والغد فوراً.</p>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <article key={stat.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  <p className="mt-3 text-2xl font-bold text-slate-950">{stat.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-clinic-50 text-clinic-700">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </article>
          );
        })}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <AppointmentList title="مواعيد اليوم" items={today} empty="لا توجد مواعيد اليوم" />
        <AppointmentList title="مواعيد الغد" items={tomorrow} empty="لا توجد مواعيد غداً" highlight />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">أقرب موعد قادم</h3>
        {next ? (
          <p className="mt-3 text-sm text-slate-700">
            {next.patient.firstName} {next.patient.lastName} مع الدكتور {next.doctor.fullName} - {formatDateTime(next.startAt)}
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">لا يوجد موعد قادم</p>
        )}
      </section>
    </div>
  );
}

function AppointmentList({ title, items, empty, highlight = false }: { title: string; items: AppointmentDto[]; empty: string; highlight?: boolean }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : null}
        {items.map((appointment) => (
          <div key={appointment.id} className={highlight ? "rounded-md border border-clinic-100 bg-clinic-50 p-3" : "rounded-md border border-slate-100 bg-slate-50 p-3"}>
            <p className="text-sm font-semibold text-slate-950">
              {formatTime(appointment.startAt)} - {appointment.patient.firstName} {appointment.patient.lastName}
            </p>
            <p className="mt-1 text-xs text-slate-600">مع الدكتور {appointment.doctor.fullName}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
