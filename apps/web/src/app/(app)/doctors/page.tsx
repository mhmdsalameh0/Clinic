"use client";

import { FormEvent, useEffect, useState } from "react";
import type { DoctorDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { prependItem, removeItem, replaceItem } from "@/lib/optimistic-list";
import { canPermanentlyDelete } from "@/lib/roles";
import { useLiveRevalidation } from "@/lib/use-live-revalidation";

export default function DoctorsPage() {
  const user = useAuth();
  const [items, setItems] = useState<DoctorDto[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const query = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : "";
  const { isInitialLoading, revalidate } = useLiveRevalidation({
    load: () => apiClient.doctors(query),
    onData: (result) => {
      setItems(result.items);
      setError("");
    },
    onError: (caught) => setError(caught instanceof ApiClientError ? caught.message : "تعذر تحميل الأطباء"),
    deps: [query]
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      const result = await apiClient.createDoctor({
        fullName: String(form.get("fullName") ?? ""),
        specialty: String(form.get("specialty") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        appointmentDurationMinutes: Number(form.get("appointmentDurationMinutes") || 30)
      });
      setItems((current) => prependItem(current, result.doctor));
      formElement.reset();
      setMessage("تمت إضافة الطبيب");
      void revalidate();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر إضافة الطبيب");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleDoctor(doctor: DoctorDto) {
    const previous = items;
    setError("");
    setPendingId(doctor.id);
    setItems((current) => replaceItem(current, { ...doctor, isActive: !doctor.isActive }));
    try {
      const result = doctor.isActive ? await apiClient.deactivateDoctor(doctor.id) : await apiClient.activateDoctor(doctor.id);
      setItems((current) => replaceItem(current, result.doctor));
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحديث حالة الطبيب");
    } finally {
      setPendingId(null);
    }
  }

  async function editDoctor(doctor: DoctorDto) {
    const fullName = window.prompt("اسم الطبيب", doctor.fullName);
    if (fullName === null) return;
    const specialty = window.prompt("الاختصاص", doctor.specialty ?? "") ?? "";
    const phone = window.prompt("الهاتف", doctor.phone ?? "") ?? "";
    const email = window.prompt("البريد الإلكتروني", doctor.email ?? "") ?? "";
    const duration = window.prompt("مدة الموعد بالدقائق", String(doctor.appointmentDurationMinutes ?? 30));
    if (duration === null) return;
    const previous = items;
    setError("");
    setMessage("");
    setPendingId(doctor.id);
    const optimistic = { ...doctor, fullName, specialty, phone, email, appointmentDurationMinutes: Number(duration) };
    setItems((current) => replaceItem(current, optimistic));
    try {
      const result = await apiClient.updateDoctor(doctor.id, { fullName, specialty, phone, email, appointmentDurationMinutes: Number(duration) });
      setItems((current) => replaceItem(current, result.doctor));
      setMessage("تم تعديل الطبيب");
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تعديل الطبيب");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteDoctor(doctor: DoctorDto) {
    if (!window.confirm("هل أنت متأكد من حذف الطبيب؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    const previous = items;
    setError("");
    setMessage("");
    setPendingId(doctor.id);
    setItems((current) => removeItem(current, doctor.id));
    try {
      await apiClient.deleteDoctor(doctor.id);
      setMessage("تم حذف الطبيب");
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر حذف الطبيب");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">الأطباء</h2>
        <div className="mt-4 flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث عن طبيب"
            className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
          <button onClick={() => void revalidate()} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">
            بحث
          </button>
        </div>
        {message ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 grid gap-3">
          {isInitialLoading ? <p className="rounded-md bg-slate-100 p-4 text-sm text-slate-500">جار تحميل الأطباء...</p> : null}
          {!isInitialLoading && items.length === 0 ? <p className="text-sm text-slate-500">لا يوجد أطباء بعد</p> : null}
          {items.map((doctor) => (
            <article key={doctor.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">الدكتور {doctor.fullName}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {doctor.specialty || "اختصاص غير محدد"} - {doctor.appointmentDurationMinutes ?? 30} دقيقة
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={pendingId === doctor.id} onClick={() => void editDoctor(doctor)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50">تعديل</button>
                  <button disabled={pendingId === doctor.id} onClick={() => void toggleDoctor(doctor)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50">
                    {doctor.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                  {canPermanentlyDelete(user.role) ? (
                    <button disabled={pendingId === doctor.id} onClick={() => void deleteDoctor(doctor)} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">حذف</button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-slate-950">إضافة طبيب</h3>
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="fullName" required placeholder="اسم الطبيب" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="specialty" placeholder="الاختصاص" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="phone" placeholder="الهاتف" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="email" type="email" placeholder="البريد" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="appointmentDurationMinutes" type="number" min="5" max="240" placeholder="مدة الموعد بالدقائق" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <button disabled={isSubmitting} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {isSubmitting ? "جار الإضافة..." : "إضافة"}
          </button>
        </form>
      </section>
    </div>
  );
}
