"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PatientDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { prependItem, removeItem, replaceItem } from "@/lib/optimistic-list";
import { canPermanentlyDelete } from "@/lib/roles";
import { useLiveRevalidation } from "@/lib/use-live-revalidation";

export default function PatientsPage() {
  const user = useAuth();
  const [items, setItems] = useState<PatientDto[]>([]);
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
    load: () => apiClient.patients(query),
    onData: (result) => {
      setItems(result.items);
      setError("");
    },
    onError: (caught) => setError(caught instanceof ApiClientError ? caught.message : "تعذر تحميل المرضى"),
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
      const result = await apiClient.createPatient({
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        alternatePhone: String(form.get("alternatePhone") ?? ""),
        email: String(form.get("email") ?? ""),
        notes: String(form.get("notes") ?? "")
      });
      setItems((current) => prependItem(current, result.patient));
      formElement.reset();
      setMessage("تمت إضافة المريض");
      void revalidate();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر إضافة المريض");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function togglePatient(patient: PatientDto) {
    const previous = items;
    setError("");
    setPendingId(patient.id);
    setItems((current) => replaceItem(current, { ...patient, isActive: !patient.isActive }));
    try {
      const result = patient.isActive ? await apiClient.deactivatePatient(patient.id) : await apiClient.activatePatient(patient.id);
      setItems((current) => replaceItem(current, result.patient));
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحديث حالة المريض");
    } finally {
      setPendingId(null);
    }
  }

  async function editPatient(patient: PatientDto) {
    const firstName = window.prompt("الاسم", patient.firstName);
    if (firstName === null) return;
    const lastName = window.prompt("الشهرة", patient.lastName);
    if (lastName === null) return;
    const phone = window.prompt("الهاتف", patient.phone);
    if (phone === null) return;
    const alternatePhone = window.prompt("هاتف إضافي", patient.alternatePhone ?? "") ?? "";
    const email = window.prompt("البريد الإلكتروني", patient.email ?? "") ?? "";
    const previous = items;
    const optimistic = { ...patient, firstName, lastName, phone, alternatePhone, email };
    setError("");
    setMessage("");
    setPendingId(patient.id);
    setItems((current) => replaceItem(current, optimistic));
    try {
      const result = await apiClient.updatePatient(patient.id, { firstName, lastName, phone, alternatePhone, email });
      setItems((current) => replaceItem(current, result.patient));
      setMessage("تم تعديل المريض");
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تعديل المريض");
    } finally {
      setPendingId(null);
    }
  }

  async function deletePatient(patient: PatientDto) {
    if (!window.confirm("هل أنت متأكد من حذف المريض؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    const previous = items;
    setError("");
    setMessage("");
    setPendingId(patient.id);
    setItems((current) => removeItem(current, patient.id));
    try {
      await apiClient.deletePatient(patient.id);
      setMessage("تم حذف المريض");
      void revalidate();
    } catch (caught) {
      setItems(previous);
      setError(caught instanceof ApiClientError ? caught.message : "تعذر حذف المريض");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">المرضى</h2>
        <div className="mt-4 flex gap-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث بالاسم أو الهاتف" className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={() => void revalidate()} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">بحث</button>
        </div>
        {message ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 grid gap-3">
          {isInitialLoading ? <p className="rounded-md bg-slate-100 p-4 text-sm text-slate-500">جار تحميل المرضى...</p> : null}
          {!isInitialLoading && items.length === 0 ? <p className="text-sm text-slate-500">لا يوجد مرضى بعد</p> : null}
          {items.map((patient) => (
            <article key={patient.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{patient.firstName} {patient.lastName}</p>
                  <p className="mt-1 text-sm text-slate-600">{patient.phone}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={pendingId === patient.id} onClick={() => void editPatient(patient)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50">تعديل</button>
                  <button disabled={pendingId === patient.id} onClick={() => void togglePatient(patient)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50">
                    {patient.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                  {canPermanentlyDelete(user.role) ? (
                    <button disabled={pendingId === patient.id} onClick={() => void deletePatient(patient)} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 disabled:opacity-50">حذف</button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-slate-950">إضافة مريض</h3>
        <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="firstName" required placeholder="الاسم" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="lastName" required placeholder="الشهرة" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="phone" required placeholder="الهاتف" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="alternatePhone" placeholder="هاتف إضافي" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="email" type="email" placeholder="البريد" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="notes" placeholder="ملاحظة" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <button disabled={isSubmitting} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {isSubmitting ? "جار الإضافة..." : "إضافة"}
          </button>
        </form>
      </section>
    </div>
  );
}
