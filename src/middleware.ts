import { NextResponse, type NextRequest } from 'next/server';

// Page-level gate: only checks that a session cookie exists. Real authorization
// happens in the API (session lookup + Postgres RLS) for every request.
const PUBLIC = ['/', '/benvenuto', '/accedi', '/registrati', '/legal'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  if (!req.cookies.get('spot_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/accedi';
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|demo|icon|manifest|favicon|.*\\.(?:svg|png|jpg|webp|ico)$).*)'],
};
