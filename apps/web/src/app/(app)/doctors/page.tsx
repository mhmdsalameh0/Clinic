"use client";

import { FormEvent, useEffect, useState } from "react";
import type { UserRole } from "@clinic/shared";
import type { DoctorDto } from "@/lib/api-client";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { canPermanentlyDelete } from "@/lib/roles";

export default function DoctorsPage() {
  const [items, setItems] = useState<DoctorDto[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState<UserRole | undefined>();

  async function load() {
    setError("");
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const [result, me] = await Promise.all([apiClient.doctors(query), apiClient.me().catch(() => null)]);
      setItems(result.items);
      if (me) setRole(me.user.role);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحميل الأطباء");
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
      await apiClient.createDoctor({
        fullName: String(form.get("fullName") ?? ""),
        specialty: String(form.get("specialty") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        appointmentDurationMinutes: Number(form.get("appointmentDurationMinutes") || 30)
      });
      formElement.reset();
      setMessage("تمت إضافة الطبيب");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر الاتصال بالخادم. تأكد من تشغيل الواجهة الخلفية ثم حاول مرة أخرى.");
    }
  }

  async function toggleDoctor(doctor: DoctorDto) {
    setError("");
    try {
      if (doctor.isActive) await apiClient.deactivateDoctor(doctor.id);
      else await apiClient.activateDoctor(doctor.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحديث حالة الطبيب");
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
    setError("");
    setMessage("");
    try {
      await apiClient.updateDoctor(doctor.id, { fullName, specialty, phone, email, appointmentDurationMinutes: Number(duration) });
      setMessage("تم تعديل الطبيب");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تعديل الطبيب");
    }
  }

  async function deleteDoctor(doctor: DoctorDto) {
    if (!window.confirm("هل أنت متأكد من حذف الطبيب؟ لا يمكن التراجع عن هذا الإجراء.")) return;
    setError("");
    setMessage("");
    try {
      await apiClient.deleteDoctor(doctor.id);
      setMessage("تم حذف الطبيب");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر حذف الطبيب");
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
          <button onClick={() => void load()} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">
            بحث
          </button>
        </div>
        {message ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 grid gap-3">
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
                  <button onClick={() => void editDoctor(doctor)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">تعديل</button>
                  <button onClick={() => void toggleDoctor(doctor)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">
                    {doctor.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                  {canPermanentlyDelete(role) ? (
                    <button onClick={() => void deleteDoctor(doctor)} className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700">حذف</button>
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
          <button className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">إضافة</button>
        </form>
      </section>
    </div>
  );
}
