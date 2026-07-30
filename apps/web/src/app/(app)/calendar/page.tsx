import { CalendarDays } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export default function CalendarPage() {
  return (
    <PagePlaceholder
      title="التقويم"
      description="أساس صفحة التقويم جاهز. سيتم ربطها لاحقا بعرض المواعيد اليومية والأسبوعية ومنع التعارضات."
      icon={CalendarDays}
    />
  );
}
