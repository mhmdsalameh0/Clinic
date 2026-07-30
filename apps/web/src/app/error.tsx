"use client";

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-lg border border-red-100 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-950">حدث خطأ غير متوقع</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">تعذر تحميل الصفحة الآن. حاول مرة أخرى.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-clinic-700"
        >
          إعادة المحاولة
        </button>
      </section>
    </main>
  );
}
