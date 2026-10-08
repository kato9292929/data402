import type { ReactNode } from "react";

export const metadata = { title: "data402", description: "Solana x402 listings, observed from outside without paying" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
