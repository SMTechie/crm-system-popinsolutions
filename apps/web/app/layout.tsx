import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "Pop In Solutions CRM",
  description: "Modular enterprise CRM platform for Pop In Solutions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={plusJakarta.variable}><PwaRegister />{children}</body>
    </html>
  );
}
