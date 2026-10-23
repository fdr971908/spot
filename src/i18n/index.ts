import { it, type Dict } from './it';

// Single locale for the first release; add dictionaries here and select by user.locale.
const dictionaries: Record<string, Dict> = { it };

export function getDict(locale = 'it'): Dict {
  return dictionaries[locale] ?? it;
}

export const t = getDict();

/** Tiny template helper: fmt('Ciao {name}', { name: 'Giulia' }) */
export function fmt(s: string, vars: Record<string, string | number> = {}) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export function errorMessage(code?: string) {
  return (code && t.errors[code]) || t.errors.generic;
}
