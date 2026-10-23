import type { NextRequest } from 'next/server';
import { handle } from '@/server/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type P = { params: Promise<{ path: string[] }> };
const h = async (req: NextRequest, { params }: P) => handle(req, (await params).path);

export { h as GET, h as POST, h as PUT, h as PATCH, h as DELETE };
