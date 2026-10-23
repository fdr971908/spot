import { notFound } from 'next/navigation';
import { Logo } from '@/components/ui';

// Placeholder legal copy: MUST be replaced by counsel-reviewed documents before launch.
const DOCS: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: 'Informativa privacy (bozza)',
    body: [
      'Questa è una bozza di sviluppo, non un documento legale definitivo.',
      'Dati trattati: account (email, data di nascita), profilo, preferenze, eventi salvati, partecipazioni, messaggi, richieste di lista e tavolo.',
      'La partecipazione agli eventi è privata per impostazione predefinita; compare tra i partecipanti solo se lo scegli per quel singolo evento.',
      'Le comunicazioni promozionali richiedono un consenso esplicito e separato, revocabile in qualsiasi momento.',
      'Puoi esportare i tuoi dati ed eliminare l’account dalle impostazioni del profilo.',
    ],
  },
  termini: {
    title: 'Termini di servizio (bozza)',
    body: [
      'Questa è una bozza di sviluppo, non un documento legale definitivo.',
      'spot. è un servizio per scoprire e organizzare esperienze. “Partecipa” indica un’intenzione e non costituisce biglietto o prenotazione.',
      'È vietato usare spot. per molestie, spam, impersonificazione o contenuti inappropriati. Puoi segnalare e bloccare utenti in qualsiasi momento.',
      'L’età minima per registrarsi è 14 anni. Alcuni eventi hanno restrizioni d’età stabilite dagli organizzatori.',
    ],
  },
};

export default async function Legal({ params }: { params: Promise<{ doc: string }> }) {
  const doc = DOCS[(await params).doc];
  if (!doc) notFound();
  return (
    <article className="px-6 py-10">
      <Logo size="sm" />
      <h1 className="mt-6 text-2xl font-extrabold">{doc.title}</h1>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-muted">
        {doc.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </article>
  );
}
