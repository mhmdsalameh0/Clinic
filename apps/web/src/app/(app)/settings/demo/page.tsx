"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";

export default function DemoDataSettingsPage() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function cleanup() {
    if (confirmation !== "مسح" || isSubmitting) return;
    if (!window.confirm("سيتم حذف جميع الدكاترة والمرضى والمواعيد والتذكيرات التجريبية. لا يمكن التراجع عن هذا الإجراء.")) return;
    setError("");
    setIsSubmitting(true);
    try {
      await apiClient.cleanupDemoData(confirmation);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر مسح بيانات التجربة");
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">بيانات التجربة</h2>
      <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
        سيتم حذف جميع الدكاترة والمرضى والمواعيد والتذكيرات التجريبية. لا يمكن التراجع عن هذا الإجراء.
      </p>
      <label className="mt-5 block">
        <span className="text-sm font-medium text-slate-700">اكتب مسح للتأكيد</span>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-clinic-600"
        />
      </label>
      {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button
        disabled={confirmation !== "مسح" || isSubmitting}
        onClick={() => void cleanup()}
        className="mt-5 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting ? "جار المسح..." : "مسح بيانات التجربة"}
      </button>
    </section>
  );
}
