/**
 * Demo data for spot. — ALL businesses, people and numbers are fictional
 * sample data (flagged is_demo). Dates are relative to "now" so the demo
 * always has upcoming and past events.
 *   npm run db:seed          (expects migrated, empty database)
 *   npm run db:reset         (migrate --reset + seed)
 */
import { Client } from 'pg';
import { loadEnv } from './env';
import { hashPassword } from '../src/server/auth';
import { DEFAULT_WEIGHTS } from '../src/server/recommend';

loadEnv();

export const DEMO_PASSWORD = 'spotdemo123';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296);
}

export async function seed(adminUrl = process.env.DATABASE_ADMIN_URL!, { quiet = false } = {}) {
  const db = new Client({ connectionString: adminUrl });
  await db.connect();
  const q = (sql: string, p: unknown[] = []) => db.query(sql, p).then((r) => r.rows);
  const one = async (sql: string, p: unknown[] = []) => (await q(sql, p))[0];
  const log = (...a: unknown[]) => !quiet && console.log(...a);
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  /** Act as a user inside functions that rely on app.uid(). */
  const as = (uid: string | null) => q("select set_config('app.user_id', $1, false)", [uid ?? '']);

  try {
    await q('begin');
    // ── Reference data ──
    await q(`insert into cities (id, name, lat, lng) values
      ('milano', 'Milano', 45.4642, 9.19), ('roma', 'Roma', 41.9028, 12.4964), ('torino', 'Torino', 45.0703, 7.6869),
      ('bologna', 'Bologna', 44.4949, 11.3426), ('napoli', 'Napoli', 40.8518, 14.2681), ('firenze', 'Firenze', 43.7696, 11.2558)`);
    await q(`insert into music_genres (id, label, sort) values
      ('techno','Techno',1),('house','House',2),('dance','Dance',3),('disco','Disco',4),('hiphop','Hip-hop',5),
      ('pop','Pop',6),('indie','Indie',7),('live','Live music',8),('electronic','Elettronica',9),('other','Altro',10)`);
    await q(`insert into event_categories (id, label, emoji, sort) values
      ('brunch','Brunch','🥞',1),('aperitivo','Aperitivo','🍹',2),('dinner','Cena','🍝',3),('concert','Concerto','🎤',4),
      ('nightclub','Club','🪩',5),('beach_club','Beach club','🏖️',6),('outdoor','Outdoor','🌿',7),('festival','Festival','🎪',8),
      ('standing_party','Party in piedi','🎉',9),('table_service','Tavolo','🍾',10),('lounge_bar','Lounge bar','🛋️',11)`);
    for (const [k, v] of Object.entries(DEFAULT_WEIGHTS)) await q('insert into recommendation_weights (key, value) values ($1, $2)', [k, v]);

    const pw = await hashPassword(DEMO_PASSWORD);
    const userIds: Record<string, string> = {};
    const mkUser = async (email: string, type: 'personal' | 'business', birthdate: string, marketing = false) => {
      const u = await one(
        `insert into users (email, password_hash, account_type, birthdate, terms_accepted_at, privacy_accepted_at, marketing_consent_at, onboarding_completed_at, is_demo, created_at)
         values ($1, $2, $3, $4, now(), now(), $5, now(), true, now() - interval '200 days') returning id`,
        [email, pw, type, birthdate, marketing ? new Date() : null],
      );
      await q('insert into notification_preferences (user_id, promotional) values ($1, $2)', [u.id, marketing]);
      return u.id as string;
    };

    // ── Businesses (fictional) ──
    type B = { slug: string; name: string; category: string; city: string; hood: string; address: string; lat: number; lng: number; desc: string; cover: string; verified?: boolean; ig?: string; site?: string; hours?: Record<string, string> };
    const businesses: B[] = [
      { slug: 'magazzino-21', name: 'Magazzino 21', category: 'club', city: 'milano', hood: 'Porta Genova', address: 'Via dei Magazzini 21, Milano', lat: 45.4505, lng: 9.1705, desc: 'Ex deposito ferroviario trasformato in club: tre sale, impianto Funktion-One e una community che balla dal 2012. (Locale demo)', cover: '/demo/covers/techno-1.svg', ig: 'magazzino21.demo', site: 'https://example.com/magazzino21', hours: { ven: '23:00–06:00', sab: '23:00–06:00', dom: '18:00–00:00' } },
      { slug: 'terrazza-lilla', name: 'Terrazza Lilla', category: 'bar', city: 'milano', hood: 'Isola', address: 'Via Pastrengo 9, Milano', lat: 45.4869, lng: 9.1887, desc: 'Rooftop con vista sullo skyline di Porta Nuova. Aperitivi, cocktail di stagione e dj set al tramonto. (Locale demo)', cover: '/demo/covers/aperitivo-1.svg', ig: 'terrazzalilla.demo', hours: { 'mar–dom': '18:00–01:00' } },
      { slug: 'officina-brunch', name: 'Officina Brunch', category: 'restaurant', city: 'milano', hood: 'NoLo', address: 'Via Padova 34, Milano', lat: 45.4955, lng: 9.2245, desc: 'Brunch del weekend, caffè specialty e cene con dj set il giovedì. Tavoli grandi per gruppi. (Locale demo)', cover: '/demo/covers/brunch-1.svg', hours: { 'sab–dom': '10:00–16:00', gio: '20:00–00:00' } },
      { slug: 'sala-prisma', name: 'Sala Prisma', category: 'venue', city: 'milano', hood: 'Bovisa', address: 'Via Durando 12, Milano', lat: 45.5032, lng: 9.1593, desc: 'Live club da 900 posti per concerti indie, jazz e hip-hop. (Locale demo)', cover: '/demo/covers/concert-1.svg', ig: 'salaprisma.demo' },
      { slug: 'onda-festival', name: 'Onda Festival', category: 'festival', city: 'milano', hood: 'Idroscalo', address: 'Idroscalo, Segrate (MI)', lat: 45.4627, lng: 9.2861, desc: 'Festival di musica elettronica e pop all’aperto. Edizioni estiva e invernale. (Organizzatore demo)', cover: '/demo/covers/festival-1.svg' },
      { slug: 'collettivo-sabato', name: 'Collettivo Sabato', category: 'promoter', city: 'milano', hood: 'Varie location', address: 'Milano', lat: 45.4642, lng: 9.19, desc: 'Party itineranti: disco, picnic elettronici e serate a tema. (Promoter demo)', cover: '/demo/covers/disco-1.svg' },
      { slug: 'lido-corallo', name: 'Lido Corallo', category: 'beach_club', city: 'roma', hood: 'Ostia', address: 'Lungomare Paolo Toscanelli 140, Roma', lat: 41.7316, lng: 12.2795, desc: 'Beach club sul litorale romano: brunch in spiaggia, sunset party e lettini fino a ottobre. (Locale demo)', cover: '/demo/covers/beach-1.svg', ig: 'lidocorallo.demo' },
      { slug: 'nebula-club', name: 'Nebula Club', category: 'club', city: 'roma', hood: 'Testaccio', address: 'Via di Monte Testaccio 60, Roma', lat: 41.8768, lng: 12.4766, desc: 'Club techno e melodic house nel cuore di Testaccio. (Locale demo)', cover: '/demo/covers/techno-2.svg' },
      { slug: 'bottega-spritz', name: 'Bottega Spritz', category: 'bar', city: 'roma', hood: 'Trastevere', address: 'Via della Lungaretta 88, Roma', lat: 41.8893, lng: 12.4707, desc: 'Aperitivo con vinili e taglieri in Trastevere. (Locale demo, verifica in corso)', cover: '/demo/covers/aperitivo-2.svg', verified: false },
      { slug: 'giardino-segreto', name: 'Giardino Segreto', category: 'organizer', city: 'roma', hood: 'Monti', address: 'Via Panisperna 1, Roma', lat: 41.8968, lng: 12.4925, desc: 'Concerti acustici, yoga e brunch in un giardino nascosto. (Organizzatore demo)', cover: '/demo/covers/outdoor-1.svg' },
    ];
    const biz: Record<string, string> = {};
    for (const b of businesses) {
      const row = await one(
        `insert into business_profiles (slug, name, category, logo_url, cover_url, description, address, city_id, neighborhood, lat, lng, opening_hours, website, instagram, contact_email, verification_status, is_demo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true) returning id`,
        [b.slug, b.name, b.category, `/demo/logos/${b.slug}.svg`, b.cover, b.desc, b.address, b.city, b.hood, b.lat, b.lng, b.hours ?? {}, b.site ?? null, b.ig ?? null, `info@${b.slug}.example.com`, b.verified === false ? 'pending' : 'verified'],
      );
      biz[b.slug] = row.id;
      const owner = await mkUser(b.slug === 'magazzino-21' ? 'business@spot.demo' : `${b.slug}@business.spot.demo`, 'business', '1985-04-12');
      await q("insert into business_staff (business_id, user_id, role) values ($1, $2, 'owner')", [row.id, owner]);
      userIds[`owner:${b.slug}`] = owner;
    }
    const staff = await mkUser('staff@spot.demo', 'business', '1994-02-02');
    await q("insert into business_staff (business_id, user_id, role) values ($1, $2, 'staff')", [biz['magazzino-21'], staff]);

    // ── People (fictional) ──
    type P = { u: string; name: string; email: string; birth: string; city: string; bio?: string; priv?: boolean; dm?: string; ig?: string; tt?: string; marketing?: boolean; genres: string[]; cats: string[]; group: string };
    const people: P[] = [
      { u: 'giuliarossi', name: 'Giulia Rossi', email: 'giulia@spot.demo', birth: '1997-06-14', city: 'milano', bio: 'Brunch la domenica, techno il sabato ✨ Milano', ig: 'giulia.rossi.demo', marketing: true, genres: ['techno', 'house', 'dance'], cats: ['nightclub', 'aperitivo', 'brunch', 'beach_club'], group: '3-5' },
      { u: 'lucab', name: 'Luca Bianchi', email: 'luca@spot.demo', birth: '1995-02-03', city: 'milano', bio: 'Vinili, bici e serate lunghe.', tt: 'luca.b.demo', dm: 'everyone', genres: ['techno', 'electronic'], cats: ['nightclub', 'festival'], group: '3-5' },
      { u: 'saraconti', name: 'Sara Conti', email: 'sara@spot.demo', birth: '1998-09-22', city: 'milano', bio: 'Spritz enthusiast 🍹', ig: 'sara.conti.demo', genres: ['pop', 'house'], cats: ['aperitivo', 'brunch'], group: '6-10' },
      { u: 'marcoferri', name: 'Marco Ferri', email: 'marco@spot.demo', birth: '1993-12-01', city: 'milano', bio: 'Festival hunter.', genres: ['electronic', 'hiphop'], cats: ['festival', 'concert'], group: '6-10' },
      { u: 'chiarae', name: 'Chiara Esposito', email: 'chiara@spot.demo', birth: '1996-03-30', city: 'milano', bio: 'Profilo privato', priv: true, ig: 'chiara.private.demo', genres: ['indie', 'live'], cats: ['concert'], group: '2' },
      { u: 'davidegreco', name: 'Davide Greco', email: 'davide@spot.demo', birth: '1994-07-07', city: 'roma', bio: 'Roma · techno & mare', tt: 'davide.g.demo', genres: ['techno', 'house'], cats: ['nightclub', 'beach_club'], group: '3-5' },
      { u: 'elenaromano', name: 'Elena Romano', email: 'elena@spot.demo', birth: '1999-01-19', city: 'roma', bio: 'Concerti, mostre, aperitivi.', ig: 'elena.romano.demo', dm: 'everyone', genres: ['indie', 'live', 'pop'], cats: ['concert', 'aperitivo', 'outdoor'], group: '2' },
      { u: 'fra.moretti', name: 'Francesco Moretti', email: 'francesco@spot.demo', birth: '1992-05-05', city: 'milano', bio: 'Sempre in pista.', genres: ['disco', 'house'], cats: ['nightclub', 'standing_party'], group: '3-5' },
      { u: 'martinag', name: 'Martina Gallo', email: 'martina@spot.demo', birth: `${new Date().getFullYear() - 16}-04-10`, city: 'milano', bio: 'Account demo minorenne (16 anni)', genres: ['pop', 'indie'], cats: ['concert', 'brunch'], group: '3-5' },
      { u: 'alessio.ricci', name: 'Alessio Ricci', email: 'alessio@spot.demo', birth: '1990-10-10', city: 'milano', bio: 'Partecipo sempre in privato.', genres: ['jazz', 'live'].filter((g) => g !== 'jazz'), cats: ['dinner', 'concert'], group: '2' },
    ];
    const uid: Record<string, string> = {};
    for (const p of people) {
      const id = await mkUser(p.email, 'personal', p.birth, !!p.marketing);
      uid[p.u] = id;
      await q('insert into personal_profiles (user_id, username, display_name, avatar_url, bio, city_id, is_private, dm_policy) values ($1,$2,$3,$4,$5,$6,$7,$8)', [
        id, p.u, p.name, `/demo/avatars/${p.u}.svg`, p.bio ?? null, p.city, !!p.priv, p.dm ?? 'connections',
      ]);
      await q('insert into user_preferences (user_id, group_size, max_distance_km, preferred_days) values ($1, $2, 30, $3)', [id, p.group, [5, 6, 0]]);
      for (const g of p.genres) await q('insert into user_preferred_genres values ($1, $2)', [id, g]);
      for (const c of p.cats) await q('insert into user_preferred_categories values ($1, $2)', [id, c]);
      if (p.ig) await q("insert into user_social_links (user_id, platform, handle) values ($1, 'instagram', $2)", [id, p.ig]);
      if (p.tt) await q("insert into user_social_links (user_id, platform, handle) values ($1, 'tiktok', $2)", [id, p.tt]);
    }
    await q("update notification_preferences set promotional = true where user_id = $1", [uid.giuliarossi]);

    const FIRST = ['Alice', 'Tommaso', 'Giorgia', 'Matteo', 'Beatrice', 'Lorenzo', 'Aurora', 'Riccardo', 'Ginevra', 'Edoardo', 'Vittoria', 'Gabriele', 'Camilla', 'Pietro', 'Noemi', 'Filippo', 'Greta', 'Leonardo', 'Bianca', 'Andrea', 'Irene', 'Simone', 'Federica', 'Nicolò'];
    const crowd: string[] = [];
    for (let i = 0; i < 60; i++) {
      const first = FIRST[i % FIRST.length];
      const city = i % 3 === 2 ? 'roma' : 'milano';
      const id = await mkUser(`crowd${i + 1}@spot.demo`, 'personal', `${1988 + (i % 12)}-0${1 + (i % 9)}-1${i % 9}`, i % 2 === 0);
      if (i % 2 === 0) await q('update notification_preferences set promotional = true where user_id = $1', [id]);
      await q('insert into personal_profiles (user_id, username, display_name, avatar_url, bio, city_id, is_private) values ($1,$2,$3,$4,$5,$6,$7)', [
        id, `${first.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}.${String.fromCharCode(97 + (i % 26))}${i + 10}`, `${first} ${String.fromCharCode(65 + ((i * 7) % 26))}.`, `/demo/avatars/crowd-${(i % 24) + 1}.svg`,
        pick(['Sempre pronta per un aperitivo', 'Dancefloor > divano', 'Milano by night', 'Concerti e buon cibo', null]), city, i % 5 === 0,
      ]);
      await q('insert into user_preferences (user_id, group_size) values ($1, $2)', [id, pick(['2', '3-5', '6-10'])]);
      crowd.push(id);
    }

    // ── Events ──
    const todayDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome', weekday: 'short' }));
    const next = (dow: number, weeks = 0) => ((dow - todayDow + 7) % 7) + weeks * 7;
    type E = {
      key: string; b: string; title: string; d: number; t: string; h: number; cat: string; genres: string[]; cover: string; desc: string;
      price?: [number, number?]; free?: boolean; age?: number; gl?: boolean; tables?: boolean; outdoor?: boolean; size?: 'small' | 'medium' | 'large';
      lineup?: string; rules?: string; cap?: number; status?: string; group?: boolean; venue?: string; address?: string; lat?: number; lng?: number; hood?: string; ticket?: boolean; series?: string;
    };
    const ev: E[] = [
      { key: 'nocturna', b: 'magazzino-21', title: 'Nocturna · Techno Marathon', d: next(6), t: '23:00', h: 7, cat: 'nightclub', genres: ['techno', 'electronic'], cover: '/demo/covers/techno-1.svg', price: [25, 35], age: 18, gl: true, tables: true, size: 'large', cap: 1500, lineup: 'Lunar Sequence, Vera Kas, Nord Collective', rules: 'Ingresso 18+ con documento. No foto in pista: adesivo sulla fotocamera all’ingresso. Uscita senza rientro dopo le 04:00.', desc: 'Sette ore di techno in tre sale. Un viaggio sonoro tra luce e materia, con un impianto pensato per chi vive la pista fino all’alba.', ticket: true },
      { key: 'housesunday', b: 'magazzino-21', title: 'House Sunday Session', d: next(0) || 7, t: '18:00', h: 6, cat: 'standing_party', genres: ['house', 'disco'], cover: '/demo/covers/house-1.svg', price: [15], age: 18, gl: true, size: 'medium', lineup: 'Mira & Teo, Sunday Club Residents', desc: 'La domenica sera più groovy di Milano: house, disco e un cortile all’aperto per prendere aria tra un set e l’altro.', series: 'sunday' },
      { key: 'halloween', b: 'magazzino-21', title: 'Halloween Rave', d: next(6, 1), t: '23:00', h: 7, cat: 'nightclub', genres: ['techno'], cover: '/demo/covers/techno-3.svg', price: [20, 30], age: 18, status: 'draft', desc: 'Bozza in lavorazione: costume obbligatorio, lineup in arrivo.' },
      { key: 'capodanno', b: 'magazzino-21', title: 'Capodanno al Magazzino', d: Math.max(30, Math.ceil((new Date(new Date().getFullYear(), 11, 31).getTime() - Date.now()) / 86400000)), t: '23:00', h: 7, cat: 'nightclub', genres: ['techno', 'house'], cover: '/demo/covers/house-2.svg', price: [45, 70], age: 18, tables: true, size: 'large', desc: 'Il conto alla rovescia più lungo dell’anno: tre sale, sei dj, brindisi a mezzanotte.', ticket: true },
      { key: 'tramonto', b: 'terrazza-lilla', title: 'Aperitivo al tramonto', d: 1, t: '18:30', h: 3, cat: 'aperitivo', genres: ['house', 'dance'], cover: '/demo/covers/aperitivo-1.svg', price: [14], tables: true, outdoor: true, size: 'small', lineup: 'Dj set di Clara Vibes', desc: 'Spritz, tapas e skyline. Dj set lounge house mentre il sole scende dietro Porta Nuova.' },
      { key: 'lillafriday', b: 'terrazza-lilla', title: 'Lilla Friday Rooftop', d: next(5) || 7, t: '19:00', h: 6, cat: 'lounge_bar', genres: ['disco', 'pop'], cover: '/demo/covers/aperitivo-3.svg', price: [12], age: 18, tables: true, gl: true, outdoor: true, size: 'small', desc: 'Il venerdì sera in terrazza: cocktail list d’autunno e disco fino all’1.' },
      { key: 'brunchvinili', b: 'officina-brunch', title: 'Brunch & Vinili', d: next(0) || 7, t: '11:30', h: 4, cat: 'brunch', genres: ['disco', 'indie'], cover: '/demo/covers/brunch-1.svg', price: [28], tables: true, size: 'small', desc: 'Pancake, uova alla Benedict e un giradischi sempre acceso. Tavoli fino a 10 persone su richiesta.' },
      { key: 'sunsetbrunch', b: 'officina-brunch', title: 'Sunset Brunch', d: next(6, 1), t: '12:00', h: 4, cat: 'brunch', genres: ['house'], cover: '/demo/covers/brunch-2.svg', price: [30], tables: true, size: 'small', desc: 'Brunch lungo con dj set house nel pomeriggio.' },
      { key: 'cenadj', b: 'officina-brunch', title: 'Cena con dj set', d: next(4) || 7, t: '20:30', h: 3.5, cat: 'dinner', genres: ['house', 'disco'], cover: '/demo/covers/dinner-1.svg', price: [40], tables: true, size: 'small', desc: 'Menù degustazione di quattro portate con dj set soulful house.' },
      { key: 'comete', b: 'sala-prisma', title: 'Le Comete · Indie Night Live', d: 5, t: '21:00', h: 3, cat: 'concert', genres: ['indie', 'live'], cover: '/demo/covers/concert-1.svg', price: [20], size: 'medium', cap: 900, lineup: 'Le Comete, opening: Vento Fermo', desc: 'La band indie dell’anno torna dal vivo con il nuovo album. Apertura porte 20:00.', ticket: true },
      { key: 'jazzsoul', b: 'sala-prisma', title: 'Jazz & Soul Session', d: 12, t: '21:00', h: 3, cat: 'concert', genres: ['live'], cover: '/demo/covers/jazz-1.svg', price: [18], size: 'medium', desc: 'Quartetto jazz e voce soul in una serata intima, posti a sedere disponibili.', ticket: true },
      { key: 'blockparty', b: 'sala-prisma', title: 'Hip-hop Block Party', d: 9, t: '22:00', h: 5, cat: 'standing_party', genres: ['hiphop'], cover: '/demo/covers/hiphop-1.svg', price: [15, 20], age: 18, size: 'large', desc: 'Open mic, breakdance crew e dj set old school & new school.' },
      { key: 'cancelled', b: 'sala-prisma', title: 'Acoustic Live (annullato)', d: 3, t: '21:00', h: 2, cat: 'concert', genres: ['live'], cover: '/demo/covers/concert-3.svg', price: [12], status: 'cancelled', desc: 'Evento annullato dall’organizzatore.' },
      { key: 'ondawinter', b: 'onda-festival', title: 'Onda Festival · Winter Edition', d: 20, t: '16:00', h: 10, cat: 'festival', genres: ['electronic', 'house', 'pop'], cover: '/demo/covers/festival-1.svg', price: [45, 65], outdoor: true, size: 'large', cap: 8000, lineup: 'Aurora Bloom, Kollektiv Mare, Neon Twins, Sole Ventura', desc: 'Due palchi, food truck e installazioni luminose sul lago. Una giornata intera di musica all’aperto.', ticket: true, venue: 'Idroscalo · Area Spettacoli' },
      { key: 'picnic', b: 'collettivo-sabato', title: 'Picnic Elettronico', d: next(6) || 7, t: '14:00', h: 6, cat: 'outdoor', genres: ['electronic', 'house'], cover: '/demo/covers/outdoor-1.svg', free: true, outdoor: true, size: 'medium', venue: 'Parco Sempione · Arena', address: 'Piazza Sempione, Milano', lat: 45.4755, lng: 9.1755, hood: 'Sempione', desc: 'Porta una coperta: musica elettronica dolce, gelato artigianale e tramonto al parco. Gratuito.' },
      { key: 'discoinferno', b: 'collettivo-sabato', title: 'Disco Inferno · 70s/80s', d: 6, t: '23:00', h: 5, cat: 'nightclub', genres: ['disco', 'pop'], cover: '/demo/covers/disco-1.svg', price: [15], age: 18, gl: true, size: 'medium', venue: 'Spazio Varesine', address: 'Via Viviani 4, Milano', lat: 45.4836, lng: 9.1953, hood: 'Porta Nuova', desc: 'Paillettes, palla stroboscopica e i classici che conosci a memoria.' },
      { key: 'sunsetbeach', b: 'lido-corallo', title: 'Ultimo Sunset Beach Party', d: 1, t: '17:00', h: 6, cat: 'beach_club', genres: ['house', 'dance'], cover: '/demo/covers/beach-1.svg', price: [15], outdoor: true, tables: true, gl: true, size: 'medium', desc: 'L’ultimo tramonto della stagione in spiaggia: dj set house e cocktail con i piedi nella sabbia.' },
      { key: 'beachbrunch', b: 'lido-corallo', title: 'Beach Club Brunch', d: 2, t: '12:00', h: 4, cat: 'brunch', genres: ['pop'], cover: '/demo/covers/beach-2.svg', price: [25], outdoor: true, tables: true, size: 'small', desc: 'Brunch vista mare con prodotti del litorale e musica acustica.' },
      { key: 'nebula', b: 'nebula-club', title: 'Nebula · Techno Underground', d: next(6) || 7, t: '23:30', h: 6, cat: 'nightclub', genres: ['techno'], cover: '/demo/covers/techno-2.svg', price: [18, 25], age: 18, gl: true, size: 'medium', lineup: 'Mara Ventus, DRK', desc: 'Buio, fumo e cassa dritta. Il sabato più intenso di Testaccio.' },
      { key: 'melodic', b: 'nebula-club', title: 'Melodic House Night', d: next(5, 1), t: '23:30', h: 5, cat: 'nightclub', genres: ['house', 'electronic'], cover: '/demo/covers/house-2.svg', price: [15], age: 18, size: 'medium', desc: 'Melodie lunghe e visual immersivi.' },
      { key: 'spritzvinili', b: 'bottega-spritz', title: 'Spritz & Vinili', d: 0, t: '18:00', h: 3.5, cat: 'aperitivo', genres: ['disco', 'indie'], cover: '/demo/covers/aperitivo-2.svg', price: [10], size: 'small', desc: 'Aperitivo con selezione di vinili a cura dei clienti: porta il tuo disco preferito!' },
      { key: 'aperitivogiovedi', b: 'bottega-spritz', title: 'Aperitivo del Giovedì', d: next(4) || 7, t: '18:30', h: 3, cat: 'aperitivo', genres: ['pop'], cover: '/demo/covers/aperitivo-3.svg', price: [12], tables: true, size: 'small', desc: 'Ogni giovedì: tagliere e spritz a prezzo fisso.', series: 'giovedi' },
      { key: 'giardinoconcerto', b: 'giardino-segreto', title: 'Concerto nel Giardino', d: 7, t: '17:00', h: 3, cat: 'outdoor', genres: ['live', 'indie'], cover: '/demo/covers/outdoor-2.svg', free: true, outdoor: true, size: 'small', desc: 'Set acustico al tramonto tra limoni e lucine. Ingresso libero fino a esaurimento posti.' },
      { key: 'yogabrunch', b: 'giardino-segreto', title: 'Yoga & Brunch all’aperto', d: 10, t: '10:00', h: 3, cat: 'brunch', genres: ['other'], cover: '/demo/covers/brunch-3.svg', price: [22], outdoor: true, size: 'small', desc: 'Un’ora di yoga dolce e poi brunch vegetariano condiviso.' },
    ];
    // Past events (history, reconnection, recap)
    const past: E[] = [
      { key: 'p_nocturna', b: 'magazzino-21', title: 'Nocturna · Opening Night', d: -6, t: '23:00', h: 7, cat: 'nightclub', genres: ['techno'], cover: '/demo/covers/techno-3.svg', price: [20], age: 18, size: 'large', desc: 'La prima Nocturna della stagione.' },
      { key: 'p_disco', b: 'collettivo-sabato', title: 'Disco Lovers Night', d: -3, t: '23:00', h: 5, cat: 'nightclub', genres: ['disco'], cover: '/demo/covers/disco-2.svg', price: [12], age: 18, size: 'medium', desc: 'Una notte di disco classics.', venue: 'Spazio Varesine', address: 'Via Viviani 4, Milano', lat: 45.4836, lng: 9.1953 },
      { key: 'p_brunch', b: 'officina-brunch', title: 'Sunset Brunch · Ottobre', d: -13, t: '12:00', h: 4, cat: 'brunch', genres: ['house'], cover: '/demo/covers/brunch-2.svg', price: [30], size: 'small', desc: 'Brunch e dj set.' },
      { key: 'p_lilla', b: 'terrazza-lilla', title: 'Aperitivo Lilla · Fine estate', d: -34, t: '18:30', h: 3, cat: 'aperitivo', genres: ['house'], cover: '/demo/covers/aperitivo-1.svg', price: [14], size: 'small', desc: 'Ultimo aperitivo d’estate in terrazza.' },
      { key: 'p_beach', b: 'lido-corallo', title: 'Beach Closing Party', d: -45, t: '17:00', h: 7, cat: 'beach_club', genres: ['house', 'dance'], cover: '/demo/covers/beach-3.svg', price: [15], outdoor: true, size: 'medium', desc: 'Festa di fine stagione.' },
      { key: 'p_indie', b: 'sala-prisma', title: 'Indie Summer Live', d: -95, t: '21:00', h: 3, cat: 'concert', genres: ['indie', 'live'], cover: '/demo/covers/concert-2.svg', price: [18], size: 'medium', desc: 'Concerto estivo.' },
      { key: 'p_onda', b: 'onda-festival', title: 'Onda Festival · Summer Edition', d: -110, t: '16:00', h: 10, cat: 'festival', genres: ['electronic', 'pop'], cover: '/demo/covers/festival-2.svg', price: [55], outdoor: true, size: 'large', desc: 'Edizione estiva.' },
      { key: 'p_nebula', b: 'nebula-club', title: 'Nebula · Spring Session', d: -180, t: '23:30', h: 6, cat: 'nightclub', genres: ['techno'], cover: '/demo/covers/techno-2.svg', price: [18], age: 18, size: 'medium', desc: 'Weekend romano.' },
    ];
    // extra past occurrences across the year for the recap
    const monthsBack = [200, 230, 250, 265, 140, 160, 75, 60];
    monthsBack.forEach((d, i) => {
      const t = pick([
        ['magazzino-21', 'Nocturna', 'nightclub', ['techno'], 'techno-1'],
        ['officina-brunch', 'Brunch & Vinili', 'brunch', ['disco'], 'brunch-1'],
        ['terrazza-lilla', 'Aperitivo al tramonto', 'aperitivo', ['house'], 'aperitivo-3'],
        ['sala-prisma', 'Live Session', 'concert', ['live'], 'concert-3'],
      ] as const);
      past.push({ key: `p_extra${i}`, b: t[0], title: `${t[1]} · Edizione ${i + 1}`, d: -d, t: '21:00', h: 4, cat: t[2], genres: [...t[3]], cover: `/demo/covers/${t[4]}.svg`, price: [15], size: 'medium', desc: 'Edizione passata.' });
    });

    const eid: Record<string, string> = {};
    const series: Record<string, string> = {};
    const bInfo = Object.fromEntries(businesses.map((b) => [b.slug, b]));
    const insertEvent = async (e: E, isPast: boolean) => {
      const b = bInfo[e.b];
      const ts = await one(
        `select ((date_trunc('day', now() at time zone 'Europe/Rome') + make_interval(days => $1) + $2::time) at time zone 'Europe/Rome') as s`,
        [e.d, e.t],
      );
      const starts: Date = ts.s;
      const ends = new Date(starts.getTime() + e.h * 3600_000);
      const status = e.status ?? (isPast ? 'completed' : 'published');
      if (e.series && !series[e.series]) series[e.series] = (await one('select gen_random_uuid() as id')).id;
      const row = await one(
        `insert into events (business_id, series_id, title, description, cover_url, starts_at, ends_at, venue_name, address, city_id, neighborhood, lat, lng, category_id,
           is_outdoor, venue_size, is_free, price_min, price_max, min_age, rules, lineup, ticket_url, capacity, group_friendly, guest_list_enabled, table_requests_enabled,
           status, published_at, cancelled_at, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31, $6::timestamptz - interval '25 days') returning id`,
        [
          biz[e.b], e.series ? series[e.series] : null, e.title, e.desc, e.cover, starts, ends, e.venue ?? b.name, e.address ?? b.address, b.city, e.hood ?? b.hood,
          e.lat ?? b.lat, e.lng ?? b.lng, e.cat, !!e.outdoor, e.size ?? 'medium', !!e.free, e.free ? null : e.price![0], e.free ? null : e.price![1] ?? null,
          e.age ?? null, e.rules ?? null, e.lineup ?? null, e.ticket ? `https://example.com/tickets/${e.key}` : null, e.cap ?? null, e.group ?? true,
          !!e.gl, !!e.tables, status, status === 'draft' ? null : new Date(starts.getTime() - 20 * 86400_000), status === 'cancelled' ? new Date() : null,
          userIds[`owner:${e.b}`],
        ],
      );
      for (const g of e.genres) await q('insert into event_music_genres values ($1, $2)', [row.id, g]);
      eid[e.key] = row.id;
      return row.id;
    };
    for (const e of ev) await insertEvent(e, false);
    for (const e of past) await insertEvent(e, true);
    // recurring occurrences
    for (const [key, weeks] of [['housesunday', [1, 2]], ['aperitivogiovedi', [1, 2]]] as const) {
      const base = ev.find((x) => x.key === key)!;
      for (const w of weeks) await insertEvent({ ...base, key: `${key}_${w}`, d: base.d + 7 * w }, false);
    }

    // ── Social graph ──
    const follow = async (u: string, b: string, promo = false, daysAgo = 30) =>
      q('insert into user_follows (user_id, business_id, notify_promotions, created_at) values ($1, $2, $3, now() - make_interval(days => $4)) on conflict do nothing', [u, biz[b], promo, daysAgo]);
    for (const b of ['magazzino-21', 'terrazza-lilla', 'officina-brunch', 'lido-corallo', 'onda-festival']) await follow(uid.giuliarossi, b, b === 'magazzino-21', 90);
    await follow(uid.lucab, 'magazzino-21', true); await follow(uid.lucab, 'nebula-club');
    await follow(uid.saraconti, 'terrazza-lilla'); await follow(uid.saraconti, 'officina-brunch');
    await follow(uid.marcoferri, 'onda-festival'); await follow(uid.marcoferri, 'sala-prisma'); await follow(uid.marcoferri, 'magazzino-21');
    await follow(uid.davidegreco, 'nebula-club'); await follow(uid.davidegreco, 'lido-corallo');
    await follow(uid.elenaromano, 'giardino-segreto'); await follow(uid.elenaromano, 'bottega-spritz');
    for (const [i, c] of crowd.entries()) {
      const slugs = Object.keys(biz).filter(() => r() < 0.35);
      if (i < 45) slugs.push('magazzino-21');
      for (const s of new Set(slugs)) await follow(c, s, r() < 0.6, Math.floor(r() * 60));
    }

    // Saves & attendance by the crowd on upcoming events (sample analytics)
    const upcomingKeys = ev.filter((e) => !e.status).map((e) => e.key);
    await as(null);
    for (const k of upcomingKeys) {
      for (const c of crowd) {
        if (r() < 0.25) await q('insert into event_saves (user_id, event_id, created_at) values ($1, $2, now() - make_interval(hours => $3)) on conflict do nothing', [c, eid[k], Math.floor(r() * 400)]);
        const ageOk = !ev.find((e) => e.key === k)!.age;
        if (r() < (k === 'nocturna' ? 0.45 : 0.18) && (ageOk || true))
          await q("insert into event_attendance (user_id, event_id, status, visibility, created_at) values ($1, $2, 'going', $3, now() - make_interval(hours => $4)) on conflict do nothing", [
            c, eid[k], r() < 0.5 ? 'public' : 'private', Math.floor(r() * 400),
          ]);
      }
    }
    // Analytics (sample impressions/views over 30 days)
    for (const k of [...upcomingKeys, 'p_nocturna', 'p_disco', 'p_brunch']) {
      const weight = k === 'nocturna' ? 3 : k.startsWith('p_') ? 0.6 : 1;
      await q(
        `insert into event_analytics (event_id, kind, created_at)
         select $1, kind, now() - (random() * interval '30 days')
         from (select 'impression' as kind from generate_series(1, $2) union all select 'view' from generate_series(1, $3)
               union all select 'ticket_click' from generate_series(1, $4) union all select 'share' from generate_series(1, $5)) x`,
        [eid[k], Math.round((300 + r() * 700) * weight), Math.round((60 + r() * 160) * weight), Math.round((5 + r() * 30) * weight), Math.round((2 + r() * 15) * weight)],
      );
    }

    // Main demo persona: Giulia
    const G = uid.giuliarossi;
    for (const k of ['nocturna', 'brunchvinili', 'tramonto', 'ondawinter', 'comete', 'sunsetbeach', 'picnic'])
      await q('insert into event_saves (user_id, event_id, created_at) values ($1, $2, now() - interval \'2 days\') on conflict do nothing', [G, eid[k]]);
    await q("insert into event_attendance (user_id, event_id, status, visibility) values ($1, $2, 'going', 'public')", [G, eid.nocturna]);
    await q("insert into event_attendance (user_id, event_id, status, visibility) values ($1, $2, 'going', 'private')", [G, eid.brunchvinili]);
    await q("insert into event_attendance (user_id, event_id, status, visibility) values ($1, $2, 'cancelled', 'private')", [G, eid.comete]);
    for (const [u, vis] of [['lucab', 'public'], ['saraconti', 'public'], ['marcoferri', 'private'], ['fra.moretti', 'public'], ['chiarae', 'public'], ['alessio.ricci', 'private']] as const)
      await q("insert into event_attendance (user_id, event_id, status, visibility) values ($1, $2, 'going', $3) on conflict do nothing", [uid[u], eid.nocturna, vis]);
    await q("insert into event_attendance (user_id, event_id, status, visibility) values ($1, $2, 'going', 'private') on conflict do nothing", [uid.martinag, eid.comete]);

    // Past attendance: triggers that guard "event still open" are bypassed for historical rows only.
    await q("set session_replication_role = replica");
    const pastAttend = async (u: string, k: string, vis: string, resp: string | null) => {
      const a = await one("insert into event_attendance (user_id, event_id, status, visibility, created_at) values ($1, $2, 'going', $3, now() - interval '200 days') on conflict do nothing returning id", [u, eid[k], vis]);
      if (a && resp) await q('insert into attendance_confirmations (attendance_id, response) values ($1, $2)', [a.id, resp]);
    };
    for (const k of past.map((p) => p.key).filter((k) => k !== 'p_disco')) await pastAttend(G, k, k === 'p_nocturna' ? 'public' : 'private', 'attended');
    await pastAttend(G, 'p_disco', 'private', null); // → "Hai partecipato?" prompt
    for (const [u, vis] of [['lucab', 'public'], ['saraconti', 'public'], ['marcoferri', 'public'], ['chiarae', 'public'], ['alessio.ricci', 'private'], ['fra.moretti', 'public'], ['davidegreco', 'public']] as const)
      await pastAttend(uid[u], 'p_nocturna', vis, 'attended');
    for (const c of crowd.slice(0, 30)) await pastAttend(c, 'p_nocturna', r() < 0.4 ? 'public' : 'private', r() < 0.7 ? 'attended' : null);
    await q("set session_replication_role = origin");

    // ── Groups & chats (created through the real functions, acting as each user) ──
    const ago = (min: number) => new Date(Date.now() - min * 60_000);
    const msg = async (conv: string, sender: string | null, body: string | null, minAgo: number, event?: string, asBiz = false) =>
      q("insert into messages (conversation_id, sender_id, as_business, kind, body, event_id, created_at) values ($1, $2, $3, $4, $5, $6, $7)", [conv, sender, asBiz, event ? 'event' : 'text', body, event ?? null, ago(minAgo)]);
    const backdateSystem = (conv: string, minAgo: number) => q("update messages set created_at = $2 where conversation_id = $1 and kind in ('system')", [conv, ago(minAgo)]);

    await as(G);
    const crew = (await one("select app.create_group('Weekend Crew', 'permanent', null, '🎉') as id")).id;
    await one('select app.invite_to_group($1, $2::uuid[])', [crew, [uid.lucab, uid.saraconti, uid.marcoferri, uid.chiarae]]);
    for (const u of ['lucab', 'saraconti', 'marcoferri', 'chiarae']) { await as(uid[u]); await q('select app.respond_group_invite($1, true)', [crew]); }
    const crewConv = (await one('select conversation_id from groups where id = $1', [crew])).conversation_id;
    await backdateSystem(crewConv, 60 * 24 * 12);
    await q('update conversation_members set joined_at = $2 where conversation_id = $1', [crewConv, ago(60 * 24 * 12)]);
    await msg(crewConv, uid.lucab, 'Raga sabato cosa si fa? 👀', 60 * 26);
    await msg(crewConv, uid.saraconti, 'Io ci sono, basta che non finiamo alle 8 di mattina 😂', 60 * 25);
    await msg(crewConv, G, 'Guardate questo, line-up pazzesca', 60 * 24);
    await q("insert into group_events (group_id, event_id, shared_by, created_at) values ($1, $2, $3, $4)", [crew, eid.nocturna, G, ago(60 * 24)]);
    await msg(crewConv, G, null, 60 * 24 - 1, eid.nocturna);
    await msg(crewConv, uid.marcoferri, 'Sabato sono fuori Milano, passo 😢', 60 * 20);
    await msg(crewConv, uid.lucab, 'Io ci sono! Giulia ci metti in lista?', 60 * 3);
    await msg(crewConv, G, 'Fatto, ho chiesto la lista per noi. Sara conferma dall’app 🙏', 42);
    const ge = (await one('select id from group_events where group_id = $1 and event_id = $2', [crew, eid.nocturna])).id;
    for (const [u, s] of [[G, 'going'], [uid.lucab, 'going'], [uid.saraconti, 'maybe'], [uid.marcoferri, 'not_going']])
      await q('insert into group_rsvps (group_event_id, user_id, status) values ($1, $2, $3)', [ge, u, s]);
    await q("insert into group_events (group_id, event_id, shared_by, created_at) values ($1, $2, $3, $4)", [crew, eid.brunchvinili, uid.saraconti, ago(30)]);
    await msg(crewConv, uid.saraconti, 'E domenica brunch per riprenderci?', 31);
    await msg(crewConv, uid.saraconti, null, 30, eid.brunchvinili);
    const ge2 = (await one('select id from group_events where group_id = $1 and event_id = $2', [crew, eid.brunchvinili])).id;
    await q("insert into group_rsvps (group_event_id, user_id, status) values ($1, $2, 'going'), ($1, $3, 'going')", [ge2, uid.saraconti, G]);
    await q('update conversation_members set last_read_at = $2 where conversation_id = $1 and user_id = $3', [crewConv, ago(40), G]);

    // Guest list for Nocturna via the group, with per-person consent
    await as(G);
    const glr = (await one("insert into guest_list_requests (event_id, requester_id, group_id, note) values ($1, $2, $3, 'Weekend Crew, arriviamo verso mezzanotte') returning id", [eid.nocturna, G, crew])).id;
    await q("insert into guest_list_entries (request_id, user_id, display_name, consent) values ($1, $2, 'Giulia Rossi', 'accepted')", [glr, G]);
    await one('select app.add_guest_list_guests($1, $2::uuid[])', [glr, [uid.lucab, uid.saraconti]]);
    await q("update guest_list_entries set consent = 'accepted' where request_id = $1 and user_id = $2", [glr, uid.lucab]);

    // Spot group around Nocturna
    const spotG = (await one("select app.create_group('Spot · Nocturna', 'spot', $1, '🪩') as id", [eid.nocturna])).id;
    await one('select app.invite_to_group($1, $2::uuid[])', [spotG, [uid.lucab, uid['fra.moretti']]]);
    for (const u of ['lucab', 'fra.moretti']) { await as(uid[u]); await q('select app.respond_group_invite($1, true)', [spotG]); }
    const spotConv = (await one('select conversation_id from groups where id = $1', [spotG])).conversation_id;
    await q("update messages set created_at = $2 where conversation_id = $1", [spotConv, ago(60 * 30)]);
    await msg(spotConv, uid['fra.moretti'], 'Ci vediamo all’ingresso alle 23:30?', 60 * 5);
    await msg(spotConv, G, 'Perfetto 🙌', 60 * 4);

    // Aperitivo Crew (Sara admin) and a pending invite from Marco
    await as(uid.saraconti);
    const ape = (await one("select app.create_group('Aperitivo Crew', 'permanent', null, '🍹') as id")).id;
    await one('select app.invite_to_group($1, $2::uuid[])', [ape, [G, uid.elenaromano]]);
    await as(G); await q('select app.respond_group_invite($1, true)', [ape]);
    const apeConv = (await one('select conversation_id from groups where id = $1', [ape])).conversation_id;
    await backdateSystem(apeConv, 60 * 24 * 30);
    await msg(apeConv, uid.saraconti, 'Chi c’è stasera? 🍹', 60 * 24 * 2);
    await q("update conversation_members set last_read_at = now() where conversation_id = $1", [apeConv]);
    await as(uid.marcoferri);
    const fest = (await one("select app.create_group('Festival Friends', 'permanent', null, '🎪') as id")).id;
    await one('select app.invite_to_group($1, $2::uuid[])', [fest, [G, uid.lucab]]);

    // Direct chats
    await as(G);
    const dmLuca = (await one('select app.start_direct($1) as id', [uid.lucab])).id;
    await msg(dmLuca, uid.lucab, 'Hai preso i biglietti per Onda?', 60 * 26);
    await msg(dmLuca, G, 'Non ancora, li prendo stasera!', 60 * 25);
    await msg(dmLuca, uid.lucab, 'Perfetto, ci sentiamo dopo!', 60 * 24);
    await q('update conversation_members set last_read_at = now() where conversation_id = $1', [dmLuca]);

    // Business conversations
    const bconv = (await one('select app.start_business_conversation($1) as id', [biz['magazzino-21']])).id;
    await msg(bconv, G, 'Ciao! La lista per sabato chiude a che ora?', 60 * 30, eid.nocturna);
    await msg(bconv, G, 'Ciao! La lista per sabato chiude a che ora?', 60 * 30);
    await msg(bconv, userIds['owner:magazzino-21'], 'Ciao Giulia! La lista chiude venerdì alle 18:00. Promo speciale per chi entra entro l’01:00 🎟️', 60 * 6, undefined, true);
    await q('insert into business_conversation_reads (conversation_id, last_read_at) values ($1, now())', [bconv]);
    const lconv = (await one('select app.start_business_conversation($1) as id', [biz['lido-corallo']])).id;
    await msg(lconv, G, 'Avete ancora lettini per sabato?', 60 * 24 * 3);
    await msg(lconv, userIds['owner:lido-corallo'], 'Sì! Ti teniamo due lettini in prima fila ☀️', 60 * 24 * 2, undefined, true);
    await q('update conversation_members set last_read_at = now() where conversation_id = $1', [lconv]);
    await q('insert into business_conversation_reads (conversation_id, last_read_at) values ($1, now())', [lconv]);
    await as(uid.marcoferri);
    const mconv = (await one('select app.start_business_conversation($1) as id', [biz['magazzino-21']])).id;
    await msg(mconv, uid.marcoferri, 'Salve, avete un tavolo per 6 persone per Capodanno?', 50);
    await as(uid.lucab);
    const lc2 = (await one('select app.start_business_conversation($1) as id', [biz['magazzino-21']])).id;
    await msg(lc2, uid.lucab, 'Il guardaroba è incluso nel biglietto?', 60 * 9);

    // Table requests
    await as(uid.marcoferri);
    await q("insert into table_requests (event_id, user_id, party_size, contact_name, contact_phone, notes) values ($1, $2, 6, 'Marco Ferri', '+39 333 000 0001', 'Compleanno di un amico, possibile torta?')", [eid.capodanno, uid.marcoferri]);
    await as(uid.saraconti);
    await q("insert into table_requests (event_id, user_id, party_size, contact_name, contact_phone) values ($1, $2, 8, 'Sara Conti', '+39 333 000 0002')", [eid.tramonto, uid.saraconti]);
    for (const c of crowd.slice(0, 6)) {
      await as(c);
      const gr = (await one("insert into guest_list_requests (event_id, requester_id, note) values ($1, $2, null) returning id", [eid.nocturna, c])).id;
      const p = await one('select display_name from personal_profiles where user_id = $1', [c]);
      await q("insert into guest_list_entries (request_id, user_id, display_name, consent) values ($1, $2, $3, 'accepted')", [gr, c, p.display_name]);
    }
    await as(userIds['owner:magazzino-21']);
    await q("update guest_list_requests set status = 'confirmed' where requester_id = any($1::uuid[]) and event_id = $2", [crowd.slice(0, 3), eid.nocturna]);

    // Campaigns
    const camp = (await one("insert into business_campaigns (business_id, title, message, audience, event_id, status, created_by, created_at) values ($1, 'Prevendite Nocturna', 'Ultimi biglietti early bird per sabato: entra entro l’01:00 con la promo spot.', 'followers', $2, 'draft', $3, now() - interval '6 days') returning id", [biz['magazzino-21'], eid.nocturna, userIds['owner:magazzino-21']])).id;
    await q('select app._deliver_campaign($1)', [camp]);
    await q("update business_campaigns set sent_at = now() - interval '6 days' where id = $1", [camp]);
    await q("update notifications set created_at = now() - interval '6 days', read_at = case when random() < 0.45 then now() - interval '5 days' end where campaign_id = $1", [camp]);
    await q("insert into business_campaigns (business_id, title, message, audience, event_id, scheduled_at, status, created_by) values ($1, 'Capodanno: tavoli aperti', 'Da oggi puoi richiedere il tuo tavolo per Capodanno direttamente su spot.', 'followers', $2, now() + interval '2 days', 'scheduled', $3)", [biz['magazzino-21'], eid.capodanno, userIds['owner:magazzino-21']]);

    // Notifications for Giulia
    await q("select app.notify($1, 'guest_list_update', 'Richiesta lista inviata', 'Magazzino 21 ti risponderà a breve. Sara deve ancora confermare.', $2, $3)", [G, `/eventi/${eid.nocturna}`, glr]);
    await q("insert into notifications (user_id, category, type, title, body, link, ref_id, created_at) values ($1, 'transactional', 'attendance_prompt', 'Hai partecipato a Disco Lovers Night?', 'Conferma per tenere traccia delle tue esperienze. Solo tu vedrai il tuo storico.', '/calendario?view=past', $2, now() - interval '2 days')", [G, eid.p_disco]);
    await q("insert into notifications (user_id, category, type, title, body, link, ref_id, created_at, read_at) values ($1, 'transactional', 'suggestion', 'Nuovo evento da un locale che segui', 'Terrazza Lilla ha pubblicato Lilla Friday Rooftop', $2, $3, now() - interval '1 day', now())", [G, `/eventi/${eid.lillafriday}`, eid.lillafriday]);

    // invites already accepted are not "new"
    await q("update notifications n set read_at = now() where type = 'group_invite' and exists (select 1 from group_members gm where gm.group_id = n.ref_id and gm.user_id = n.user_id and gm.status = 'active')");
    await q('update business_profiles b set follower_count = (select count(*) from user_follows f where f.business_id = b.id)');
    await q('update conversations c set last_message_at = coalesce((select max(created_at) from messages m where m.conversation_id = c.id), c.created_at)');
    await as(null);
    await q('commit');
    log(`✓ seeded: ${businesses.length} businesses, ${people.length + crowd.length} people, ${ev.length + past.length} events`);
    log(`  demo login: giulia@spot.demo / ${DEMO_PASSWORD}  ·  business@spot.demo / ${DEMO_PASSWORD}`);
    return { uid, biz, eid, crowd };
  } catch (e) {
    await q('rollback').catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  seed().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
