// Icons: the UI's line icons, one drawing per kind of ward, and the app's logo.
import { raw, norm } from './util.js';

export const svg = (d, { w = 22, sw = 2.2, fill = 'none' } = {}) =>
  raw(`<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);

export const ICON = {
  search: (w) => svg('<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>', { w }),
  hospital: (w) => svg('<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path><path d="M16 9h2a2 2 0 0 1 2 2v10"></path><path d="M3 21h18"></path><path d="M8 7h4M8 11h4M8 15h4"></path>', { w }),
  star: (w, fill = 'none') => svg('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"></path>', { w, fill }),
  plus: (w) => svg('<path d="M12 5v14M5 12h14"></path>', { w }),
  back: (w = 20) => svg('<path d="M15 6l-6 6 6 6"></path>', { w, sw: 2.4 }),
  chevron: (w = 20) => svg('<path d="M9 6l6 6-6 6"></path>', { w, sw: 2.4 }),
  close: (w = 18) => svg('<path d="M6 6l12 12M18 6L6 18"></path>', { w, sw: 2.4 }),
  edit: (w = 20) => svg('<path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M13 7l4 4"></path>', { w }),
  phone: (w = 18) => svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path>', { w }),
  door: (w = 14) => svg('<path d="M5 21V4a1 1 0 0 1 1-1h9l4 2v16"></path><path d="M3 21h18"></path><path d="M12 12h.01"></path>', { w, sw: 2.4 }),
  lift: (w = 14) => svg('<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M9 9l3-3 3 3"></path><path d="M9 15l3 3 3-3"></path>', { w, sw: 2.4 }),
  info: (w = 20) => svg('<circle cx="12" cy="12" r="9"></circle><path d="M12 8h.01M11 12h1v5h1"></path>', { w }),
  layers: (w = 20) => svg('<path d="M12 3l9 5-9 5-9-5z"></path><path d="M3 13l9 5 9-5"></path>', { w }),
  check: (w = 18) => svg('<path d="M5 12l5 5L20 7"></path>', { w, sw: 2.4 }),
  sun: (w = 22) => svg('<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>', { w }),
  moon: (w = 22) => svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path>', { w }),
  user: (w = 22) => svg('<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>', { w })
};

// One drawing per kind of ward, the same in every hospital: picked from the ward's name
// (first matching rule wins), then from its keywords, then from its type.
const REP_SVG = {
  emergenza: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"></path>',
  sangue: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"></path>',
  ufficio: '<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5M9 12h7M9 16h7"></path>',
  lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"></path><path d="M7.5 15h9"></path>',
  radio: '<rect x="3" y="3" width="18" height="18"></rect><path d="M12 6v12M8 8.5h8M7.5 11.5h9M8 14.5h8"></path>',
  cuore: '<path d="M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.4 12 20 12 20z"></path><path d="M6 12h3l1.5-2.5 2 5 1.5-2.5h4"></path>',
  cervello: '<path d="M9.5 4A3 3 0 0 0 6.6 6.3 3 3 0 0 0 4.5 11a3 3 0 0 0 1.4 4.8A3 3 0 0 0 9.5 20H12V4z"></path><path d="M14.5 4a3 3 0 0 1 2.9 2.3 3 3 0 0 1 2.1 4.7 3 3 0 0 1-1.4 4.8A3 3 0 0 1 14.5 20H12"></path>',
  polmoni: '<path d="M12 3v8M12 11l-3 2M12 11l3 2"></path><path d="M9 7C5.5 7 4 11 4 15c0 3 1 5 3 5 2.3 0 3-1.7 3-4V8"></path><path d="M15 7c3.5 0 5 4 5 8 0 3-1 5-3 5-2.3 0-3-1.7-3-4V8"></path>',
  rene: '<path d="M9 4C5.5 4 4 7.5 4 12s1.5 8 5 8c2 0 3-1.5 3-3.5 0-1.5-1.5-2-1.5-4.5S12 9.5 12 7.5C12 5.5 11 4 9 4z"></path><path d="M16 4c2.5 0 4 3.5 4 8s-1.5 8-4 8"></path>',
  stomaco: '<path d="M9 3v4c0 1.5-3 2.5-3 7a6 6 0 0 0 6 6h2a5 5 0 0 0 0-10c-2.5 0-2.5 3-5 3"></path>',
  occhio: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
  orecchio: '<path d="M7 9a5 5 0 0 1 10 0c0 3.5-3 4-3 7.5a3 3 0 0 1-5.6 1.5"></path><path d="M10 10a2 2 0 0 1 4 0c0 1.5-1.5 2-1.5 3"></path>',
  dente: '<path d="M7.5 3C5.5 3 4 4.8 4 7c0 3 1.5 4 2 7 .5 3 1 7 2.5 7S10 16 12 16s2 5 3.5 5 2-4 2.5-7c.5-3 2-4 2-7 0-2.2-1.5-4-3.5-4-2 0-3 1-4.5 1S9.5 3 7.5 3z"></path>',
  osso: '<path d="M8 8.5 15.5 16"></path><path d="M6.5 10.5a2.5 2.5 0 1 1-1-4.8 2.5 2.5 0 1 1 4.8-1L10 8.5"></path><path d="M17.5 13.5a2.5 2.5 0 1 1 1 4.8 2.5 2.5 0 1 1-4.8 1L14 15.5"></path>',
  mamma: '<circle cx="10" cy="4.5" r="2"></circle><path d="M9 21v-5H7.5L9 10.5c.5-2 4-2 4.5.5a4 4 0 0 1 2.5 3.5 2.5 2.5 0 0 1-2.5 2.5H12v4"></path>',
  bambino: '<circle cx="12" cy="11" r="7"></circle><path d="M9.5 10h.01M14.5 10h.01"></path><path d="M9.5 13.5a3.5 3.5 0 0 0 5 0"></path><path d="M12 4c0-1 .8-2 2-2"></path>',
  onco: '<path d="M12 3a3 3 0 0 0-3 3c0 3 6 9 8 15"></path><path d="M12 3a3 3 0 0 1 3 3c0 3-6 9-8 15"></path>',
  farmacia: '<path d="M10.5 3.5a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7-7z"></path><path d="M7 7l7 7"></path>',
  mente: '<path d="M8 21v-3.5A7 7 0 1 1 19 12l1.5 3H19v2a2 2 0 0 1-2 2h-2v2"></path><path d="M11 9.5a1.8 1.8 0 1 1 2.5 1.6c-.6.3-1 .8-1 1.4"></path>',
  chirurgia: '<path d="M18 3 7 14l-1.5 4.5L10 17 21 6z"></path><path d="M3 21l3-2.5"></path>',
  intensiva: '<rect x="3" y="4" width="18" height="13"></rect><path d="M6 11h3l1.5-3 3 6 1.5-3h3"></path><path d="M9 21h6M12 17v4"></path>',
  bar: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"></path><path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17"></path><path d="M8 3v3M12 3v3"></path>',
  chiesa: '<path d="M12 2v6M9.5 4.5h5"></path><path d="M5 21v-9l7-4 7 4v9z"></path><path d="M10 21v-4h4v4"></path>',
  servizio: '<path d="M4 21V9l8-5 8 5v12"></path><path d="M9 21v-6h6v6M4 21h16"></path>',
  medicina: '<path d="M6 3v6a4 4 0 0 0 8 0V3"></path><path d="M10 13v2a5 5 0 0 0 10 0v-2"></path><circle cx="20" cy="11" r="2"></circle>'
};
const REP_RULES = [
  ['emergenza', /pronto soccorso|osservazione breve|\b118\b|potes|guardia medica/],
  ['sangue', /trasfusion|prelievi|accessi vascolari/],
  ['ufficio', /direzion|\bu.?r.?p\b|\bcup\b|cassa ticket|cartelle|tribunale|protocollo|personale|accettazione|ufficio|amministra|medico competente|formazione|infermieristica|portineria|informazioni/],
  ['lab', /laboratorio|analisi|patologia clinica|anatomia patologica/],
  ['radio', /radiolog|diagnostica per immagini|\btac\b|t.a.c|risonanza|\brmn?\b|ecograf|senolog|\brx\b/],
  ['cuore', /cardio|\butic\b|u.t.i.c|emodinam|coronar/],
  ['cervello', /neurolog|elettroencefal|\beeg\b|ictus|stroke/],
  ['polmoni', /pneumo|bronco|respirat/],
  ['rene', /nefrolog|dialisi|urolog/],
  ['stomaco', /gastro|endoscop|epatolog|fibroscan|m.?i.?c.?i\b|digestiv/],
  ['occhio', /oculist|ortottic|oftalm/],
  ['orecchio', /otorino|\bo.?r.?l\b/],
  ['dente', /odonto|dentist/],
  ['osso', /ortoped|traumatol|gessi|reumatol|fisiatr|riabilit/],
  ['mamma', /ostetric|ginecolog|\bparto\b|travaglio/],
  ['bambino', /pediatr|neonat|\bnido\b/],
  ['onco', /oncolog/],
  ['farmacia', /farmacia/],
  ['mente', /psichiatr|\bsert\b|\bserd\b|dipendenz|salute mentale/],
  ['chirurgia', /chirurg|operatori|prericover|preospedal/],
  ['intensiva', /rianimaz|anestes|intensiv/],
  ['bar', /\bbar\b|mensa|cucina/],
  ['chiesa', /chiesa|cappella/],
  ['servizio', /obitorio|mortuaria|sterilizz|tecnico/],
  ['medicina', /medicina|diabetolog|geriatr|\bd.?p.?a\b|post acuzie/]
];
const BY_TIPO = { Emergenza: 'emergenza', Servizio: 'servizio', Ufficio: 'ufficio' };

export function repKind(r) {
  for (const text of [norm(r.nome), norm(r.kw)]) {
    for (const [kind, re] of REP_RULES) if (re.test(text)) return kind;
  }
  return BY_TIPO[r.tipo] || 'medicina';
}
export const repIcon = (r, w = 20) => svg(REP_SVG[repKind(r)], { w, sw: 1.8 });

// The app's mark: three floors stacked, as on the app icon.
export const LOGO = raw('<svg class="logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32"></rect><g fill="none" stroke-width="2" stroke-linejoin="round"><path d="M16 6 26 11 16 16 6 11z"></path><path d="M6 16l10 5 10-5"></path><path d="M6 21l10 5 10-5"></path></g></svg>');
