import type { Metadata } from "next";
import "./globals.css";

import { RouteWipeProvider } from "@/components/v5/RouteWipe";

export const metadata: Metadata = {
  title: "StockLens · 个股证据诊断",
  description: "先看证据，再下结论——区分事实、分析推断与暂时无法验证的信息。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>
        <RouteWipeProvider>{children}</RouteWipeProvider>
      </body>
    </html>
  );
}
