import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mostra — Documentários em foco",
  icons: { icon: "/favicon.svg" },
  description:
    "Histórias que merecem uma tela. Inscreva seu documentário, assista às produções e participe da avaliação.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
