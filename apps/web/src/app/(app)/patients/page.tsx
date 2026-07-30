"use client";

import { FormEvent, useEffect, useState } from "react";
import type { UserRole } from "@clinic/shared";
import type { PatientDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { canPermanentlyDelete } from "@/lib/roles";

export default function PatientsPage() {
  const [items, setItems] = useState<PatientDto[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState<UserRole | undefined>();

  async function load() {
    setError("");
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const [result, me] = await Promise.all([apiClient.patients(query), apiClient.me().catch(() => null)]);
      setItems(result.items);
      if (me) setRole(me.user.role);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحميل المرضى");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setMessage("");
    try {
      await apiClient.createPatient({
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        alternatePhone: String(form.get("alternatePhone") ?? ""),
        email: String(form.get("email") ?? ""),
        notes: String(form.get("notes") ?? "")
      });
      formElement.reset();
      setMessage("تمت إضافة المريض");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر الاتصال بالخادم. تأكد من تشغيل الواجهة الخلفية ثم حاول مرة أخرى.");
    }
  }

  async function togglePatient(patient: PatientDto) {
    setError("");
    try {
      if (patient.isActive) await apiClient.deactivatePatient(patient.id);
      else await apiClient.activatePatient(patient.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحديث حالة المريض");
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
    setError("");
    setMessage("");
    try {
      await apiClient.updatePatient(patient.id, { firstName, lastName, phone, alternatePhone, email });
      setMessage("تم تعديل المريض");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تعديل المريض");
    }
  }

  async function deletePatient(patient: PatientDto) {
    if (!window.confirm("هل أنت متأكد من حذف المريض؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setError("");
    setMessage("");
    try {
      await apiClient.deletePatient(patient.id);
      setMessage("تم حذف المريض");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر حذف المريض");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">المرضى</h2>
        <div className="mt-4 flex gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف" className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <button onClick={() => void load()} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">بحث</button>
        </div>
        {message ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 grid gap-3">
          {items.map((patient) => (
            <article key={patient.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{patient.firstName} {patient.lastName}</p>
                  <p className="mt-1 text-sm text-slate-600">{patient.phone}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void editPatient(patient)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">تعديل</button>
                  <button onClick={() => void togglePatient(patient)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                    {patient.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                  {canPermanentlyDelete(role) ? (
                    <button onClick={() => void deletePatient(patient)} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700">حذف</button>
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
          <button className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">إضافة</button>
        </form>
      </section>
    </div>
  );
}
