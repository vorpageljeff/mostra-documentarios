import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mostra de Documentários | Faculdade Donaduzzi",
  icons: { icon: "/favicon.svg" },
  description:
    "Documentários dos alunos da disciplina Profissional de TI e o Mercado de Trabalho, da Faculdade Donaduzzi. Inscreva seu filme, assista e avalie.",
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
