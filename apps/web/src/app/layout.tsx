import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CLINIC",
  description: "نظام إدارة مواعيد وتنبيهات العيادة"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
