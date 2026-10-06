import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Copilot Chat POC",
  description: "Chat with an agent on your own GitHub Copilot subscription.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
