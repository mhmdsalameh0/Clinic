import { Settings } from "lucide-react";
import { PagePlaceholder } from "@/components/page-placeholder";

export default function SettingsPage() {
  return (
    <PagePlaceholder
      title="الإعدادات"
      description="سيتم هنا ضبط بيانات العيادة والتوقيت ومدة الموعد الافتراضية في مرحلة لاحقة."
      icon={Settings}
    />
  );
}
