import { Suspense } from 'react';
import { LoginForm } from '@/components/auth-forms';

export const metadata = { title: 'Accedi' };
export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
