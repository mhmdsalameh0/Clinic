import type { LucideIcon } from "lucide-react";

export function PagePlaceholder({
  title,
  description,
  icon: Icon
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-clinic-50 text-clinic-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">{description}</p>
        </div>
      </div>
    </section>
  );
}
