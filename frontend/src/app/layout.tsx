import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'katex/dist/katex.min.css';

import { getEnv } from "@/lib/env";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AuthProvider from "@/components/AuthProvider";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";
import { ErrorBoundaryWrapper } from "@/components/ErrorBoundaryWrapper";

getEnv();

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sindhu's Mathswiz Classes",
  description: "AI-Powered EdTech Platform for Mathematics Mastery",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ErrorBoundaryWrapper>
            <AuthProvider>
              <Toaster position="top-right" />
              <Navbar />
              <main className="flex-grow">
                {children}
              </main>
              <Footer />
            </AuthProvider>
          </ErrorBoundaryWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}
