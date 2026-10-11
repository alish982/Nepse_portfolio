import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bodoni-moda";
import "@fontsource-variable/jost";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mohar | NEPSE portfolio tracker", template: "%s | Mohar" },
  description:
    "Track your NEPSE holdings with weighted-average cost, live prices and honest profit and loss across multiple portfolios.",
};

export const viewport: Viewport = { themeColor: "#0c0d0b", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
