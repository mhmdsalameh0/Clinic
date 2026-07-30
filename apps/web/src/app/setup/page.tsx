"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void apiClient.bootstrapStatus().then((status) => {
      if (status.initialized) router.replace("/login");
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setIsSubmitting(true);
    try {
      await apiClient.bootstrap({
        clinicName: String(form.get("clinicName") ?? ""),
        adminFullName: String(form.get("adminFullName") ?? ""),
        adminEmail: String(form.get("adminEmail") ?? ""),
        password: String(form.get("password") ?? "")
      });
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر إنشاء العيادة");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-clinic-700">الإعداد الأولي</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">تسجيل العيادة</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          أنشئ العيادة وحساب المدير مرة واحدة. يمكن تعديل الهاتف والبريد والعنوان لاحقاً من الإعدادات.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field name="clinicName" label="اسم العيادة" required />
          <Field name="adminFullName" label="اسم المدير" required />
          <Field name="adminEmail" label="بريد المدير" type="email" required />
          <Field name="password" label="كلمة المرور" type="password" required />
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-clinic-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinic-700 disabled:opacity-60"
          >
            {isSubmitting ? "جار التسجيل..." : "تسجيل العيادة"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-clinic-600"
      />
    </label>
  );
}
