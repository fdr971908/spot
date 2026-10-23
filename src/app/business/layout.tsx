import { BusinessShell } from '@/components/business-shell';

export const metadata = { title: 'Business' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <BusinessShell>{children}</BusinessShell>;
}
