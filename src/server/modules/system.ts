import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { get, post, type Route } from '../router';
import { ApiError, notFound } from '../errors';

const STORAGE = () => resolve(process.env.STORAGE_DIR ?? './storage', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

// Magic-byte sniffing: we never trust the client's content-type. SVG is refused (script risk).
function sniff(buf: Buffer): { ext: string; type: string } | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  return null;
}

const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const systemRoutes: Route[] = [
  post('/uploads', 'user', async ({ req }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') throw new ApiError(400, 'file_required');
    if (file.size > MAX_BYTES) throw new ApiError(413, 'file_too_large');
    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniff(buf);
    if (!kind) throw new ApiError(415, 'unsupported_image');
    const name = `${randomUUID()}.${kind.ext}`;
    await mkdir(STORAGE(), { recursive: true });
    await writeFile(join(STORAGE(), name), buf);
    return { url: `/api/files/${name}` };
  }),

  get('/files/:name', 'public', async ({ params }) => {
    const m = params.name.match(/^([0-9a-f-]{36})\.(jpg|png|webp)$/);
    if (!m) throw notFound();
    const data = await readFile(join(STORAGE(), params.name)).catch(() => null);
    if (!data) throw notFound();
    return new Response(new Uint8Array(data), { headers: { 'content-type': TYPES[m[2]], 'cache-control': 'public, max-age=31536000, immutable' } });
  }),

  // Scheduled work: reminders, post-event prompts, scheduled campaigns, event completion.
  // Call from an external scheduler (cron, Supabase pg_cron, Vercel cron…) with the secret.
  post('/cron/tick', 'public', async ({ tx, req }) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get('x-cron-secret') !== secret) throw new ApiError(401, 'invalid_cron_secret');
    return (await tx.one<{ r: unknown }>('select app.cron_tick() as r'))!.r;
  }),

  get('/health', 'public', async ({ tx }) => {
    await tx.one('select 1');
    return { ok: true };
  }),
];
