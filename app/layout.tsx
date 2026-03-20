import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dancing 2k26",
  description: "Mario Party style bracket progression tracker",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}