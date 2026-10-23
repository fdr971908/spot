import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/providers';

export const metadata: Metadata = {
  title: { default: 'spot. — Good plans. Great people.', template: '%s · spot.' },
  description: 'Il social per chi vive gli eventi: scopri, organizza e condividi brunch, aperitivi, concerti e serate.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  appleWebApp: { capable: true, title: 'spot.', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFF9F5' },
    { media: '(prefers-color-scheme: dark)', color: '#120E1F' },
  ],
};

// Applies the saved theme before paint (no flash).
const themeScript = `try{var p=localStorage.getItem('spot-theme')||'light';if(p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
