import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth-forms';

export const metadata = { title: 'Registrati' };
export default function Page() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
