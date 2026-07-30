"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AuthenticatedUser, UserRole } from "@clinic/shared";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { roleLabels } from "@/lib/roles";

type ManagedRole = Exclude<UserRole, "SUPER_ADMIN">;

const roles: ManagedRole[] = ["CLINIC_ADMIN", "DOCTOR", "RECEPTIONIST"];

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<AuthenticatedUser[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (role) query.set("role", role);
    const result = await apiClient.users(query.size ? `?${query.toString()}` : "");
    setUsers(result.items);
  }

  useEffect(() => {
    void load().catch(() => setError("تعذر تحميل المستخدمين"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setMessage("");
    try {
      await apiClient.createUser({
        fullName: String(form.get("fullName") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        role: String(form.get("role") ?? "RECEPTIONIST") as ManagedRole,
        password: String(form.get("password") ?? "")
      });
      formElement.reset();
      setMessage("تم إنشاء المستخدم");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر إنشاء المستخدم");
    }
  }

  async function toggleUser(user: AuthenticatedUser) {
    setError("");
    try {
      if (user.isActive) await apiClient.deactivateUser(user.id);
      else await apiClient.activateUser(user.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحديث حالة المستخدم");
    }
  }

  async function resetPassword(user: AuthenticatedUser) {
    const password = passwords[user.id];
    if (!password) return;
    setError("");
    setMessage("");
    try {
      await apiClient.resetPassword(user.id, { password });
      setPasswords((current) => ({ ...current, [user.id]: "" }));
      setMessage("تم تحديث كلمة المرور");
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "تعذر تحديث كلمة المرور");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">المستخدمون</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <select value={role} onChange={(event) => setRole(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm">
            <option value="">كل الأدوار</option>
            {roles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
          </select>
          <button onClick={() => void load()} className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">بحث</button>
        </div>
        {message ? <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">الاسم</th>
                <th className="px-3 py-2 text-right">البريد</th>
                <th className="px-3 py-2 text-right">الدور</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-3 py-3">{user.fullName}</td>
                  <td className="px-3 py-3">{user.email}</td>
                  <td className="px-3 py-3">{roleLabels[user.role]}</td>
                  <td className="px-3 py-3">{user.isActive ? "نشط" : "معطل"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void toggleUser(user)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs">
                        {user.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                      <input
                        value={passwords[user.id] ?? ""}
                        onChange={(event) => setPasswords((current) => ({ ...current, [user.id]: event.target.value }))}
                        placeholder="كلمة مرور جديدة"
                        type="password"
                        className="w-36 rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                      />
                      <button onClick={() => void resetPassword(user)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs">إعادة تعيين</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">إنشاء مستخدم</h3>
        <form onSubmit={createUser} className="mt-4 grid gap-3 md:grid-cols-2">
          <input name="fullName" required placeholder="الاسم الكامل" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="email" required type="email" placeholder="البريد الإلكتروني" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="phone" placeholder="الهاتف" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <input name="password" required type="password" placeholder="كلمة المرور" className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
          <select name="role" className="rounded-md border border-slate-200 px-3 py-2 text-sm">
            {roles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
          </select>
          <button className="rounded-md bg-clinic-600 px-4 py-2 text-sm font-semibold text-white">إنشاء</button>
        </form>
      </section>
    </div>
  );
}
