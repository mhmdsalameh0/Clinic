"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarDays, LayoutDashboard, Menu, Settings, Stethoscope, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuthenticatedUser } from "@clinic/shared";
import { AuthProvider } from "@/lib/auth-context";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { roleLabels } from "@/lib/roles";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/appointments", label: "المواعيد", icon: CalendarDays },
  { href: "/doctors", label: "الأطباء", icon: Stethoscope },
  { href: "/patients", label: "المرضى", icon: UsersRound },
  { href: "/notifications", label: "التذكيرات", icon: Bell },
  { href: "/settings/clinic", label: "بيانات العيادة", icon: Settings },
  { href: "/settings/reminders", label: "التذكيرات المجدولة", icon: Bell, adminOnly: true },
  { href: "/settings/demo", label: "بيانات التجربة", icon: Settings, adminOnly: true }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const currentPage = useMemo(() => navigation.find((item) => pathname.startsWith(item.href)), [pathname]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const me = await apiClient.me();
        if (active) {
          setUser(me.user);
        }
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          const status = await apiClient.bootstrapStatus().catch(() => ({ initialized: true }));
          if (active) setIsRedirecting(true);
          router.replace(status.initialized ? "/login" : "/setup");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [router]);

  async function logout() {
    await apiClient.logout().catch(() => null);
    router.replace("/login");
  }

  if (isLoading || isRedirecting || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-sm">
          {isRedirecting || !user ? "جار تحويلك إلى صفحة الدخول..." : "جار التحقق من الجلسة..."}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-72 border-l border-slate-200 bg-white lg:block">
              <SidebarContent pathname={pathname} role={user.role} />
      </aside>
      <div className={cn("fixed inset-0 z-50 bg-slate-950/30 transition lg:hidden", isOpen ? "opacity-100" : "pointer-events-none opacity-0")} onClick={() => setIsOpen(false)} />
      <aside className={cn("fixed inset-y-0 right-0 z-50 w-72 border-l border-slate-200 bg-white transition-transform lg:hidden", isOpen ? "translate-x-0" : "translate-x-full")}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Brand />
          <button type="button" aria-label="إغلاق القائمة" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" onClick={() => setIsOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent pathname={pathname} role={user.role} onNavigate={() => setIsOpen(false)} compactBrand />
      </aside>
      <div className="lg:pr-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button type="button" aria-label="فتح القائمة" className="rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden" onClick={() => setIsOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-clinic-700">CLINIC</p>
              <h1 className="truncate text-base font-semibold text-slate-950 sm:text-lg">{currentPage?.label ?? "لوحة التحكم"}</h1>
            </div>
            <div className="hidden items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-clinic-100 text-clinic-700">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-900">{user.fullName}</p>
                <p className="text-xs text-slate-500">{roleLabels[user.role]}</p>
              </div>
              <button type="button" onClick={logout} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">
                خروج
              </button>
            </div>
          </div>
        </header>
        <AuthProvider user={user}>
          <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </AuthProvider>
      </div>
    </div>
  );
}

function SidebarContent({ pathname, role, onNavigate, compactBrand = false }: { pathname: string; role: AuthenticatedUser["role"]; onNavigate?: () => void; compactBrand?: boolean }) {
  return (
    <div className="flex h-full flex-col">
      {!compactBrand && (
        <div className="border-b border-slate-100 px-6 py-5">
          <Brand />
        </div>
      )}
      <nav className="flex-1 space-y-1 px-4 py-5">
        {navigation.filter((item) => !item.adminOnly || role === "CLINIC_ADMIN").map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavigate} className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition", active ? "bg-clinic-50 text-clinic-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950")}>
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 px-6 py-4 text-xs leading-6 text-slate-500">التوقيت الافتراضي: Asia/Beirut</div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-clinic-600 text-white">
        <Stethoscope className="h-5 w-5" />
      </div>
      <div>
        <p className="text-base font-bold text-slate-950">CLINIC</p>
        <p className="text-xs text-slate-500">إدارة مواعيد العيادة</p>
      </div>
    </Link>
  );
}
