export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-backdrop min-h-dvh">
      <div className="relative mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg">{children}</div>
    </div>
  );
}
