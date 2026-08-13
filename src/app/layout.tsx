import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FormGen — Form Engine",
  description: "Build and run questionnaires with conditional logic and computed questions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-gray-50 text-gray-900 antialiased`}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
