"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void apiClient.bootstrapStatus().then((status) => {
      if (!status.initialized) router.replace("/setup");
    });
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await apiClient.login({ email, password });
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تسجيل الدخول");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold text-clinic-700">CLINIC</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">تسجيل الدخول</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">ادخل إلى لوحة إدارة العيادة.</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">البريد الإلكتروني</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-clinic-600"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">كلمة المرور</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-clinic-600"
            />
          </label>
          {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-clinic-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-clinic-700 disabled:opacity-60"
          >
            {isSubmitting ? "جار الدخول..." : "دخول"}
          </button>
        </form>
      </section>
    </main>
  );
}

