"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ClinicSettings } from "@clinic/shared";
import { apiClient, ApiClientError } from "@/lib/api-client";

export default function ClinicSettingsPage() {
  const [clinic, setClinic] = useState<ClinicSettings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void apiClient.clinic().then((result) => setClinic(result.clinic)).catch(() => setError("تعذر تحميل بيانات العيادة"));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setError("");
    try {
      const result = await apiClient.updateClinic({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        address: String(form.get("address") ?? ""),
        timezone: String(form.get("timezone") ?? "Asia/Beirut"),
        appointmentDefaultDurationMinutes: Number(form.get("duration") ?? 30)
      });
      setClinic(result.clinic);
      setMessage("تم حفظ بيانات العيادة");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر الحفظ");
    }
  }

  if (!clinic && !error) {
    return <p className="text-sm text-slate-600">جار تحميل بيانات العيادة...</p>;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">بيانات العيادة</h2>
      <form onSubmit={submit} className="mt-6 grid gap-4 md:grid-cols-2">
        <Field name="name" label="اسم العيادة" defaultValue={clinic?.name} required />
        <Field name="phone" label="الهاتف" defaultValue={clinic?.phone ?? ""} />
        <Field name="email" label="البريد الإلكتروني" type="email" defaultValue={clinic?.email ?? ""} />
        <Field name="address" label="العنوان" defaultValue={clinic?.address ?? ""} />
        <Field name="timezone" label="المنطقة الزمنية" defaultValue={clinic?.timezone ?? "Asia/Beirut"} />
        <Field name="duration" label="مدة الموعد الافتراضية" type="number" defaultValue={String(clinic?.appointmentDefaultDurationMinutes ?? 30)} />
        {message ? <p className="md:col-span-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="md:col-span-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button className="md:col-span-2 rounded-md bg-clinic-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinic-700">
          حفظ
        </button>
      </form>
    </section>
  );
}

function Field(props: { name: string; label: string; type?: string; defaultValue?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        required={props.required}
        className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-clinic-600"
      />
    </label>
  );
}

