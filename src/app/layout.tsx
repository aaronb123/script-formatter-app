import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTRX Script Formatter",
  description: "Professional script formatting tool for MTRX productions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
