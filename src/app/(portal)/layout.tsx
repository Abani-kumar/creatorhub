import { AppShell } from '@/components/shell/app-shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
