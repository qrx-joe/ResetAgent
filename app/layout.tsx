export const metadata = {
  title: "Reset Agent | Developer Reset Protocol",
  description:
    "开发者的 3 分钟状态恢复协议，帮你判断继续、休息，还是把任务交给 Agent。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
