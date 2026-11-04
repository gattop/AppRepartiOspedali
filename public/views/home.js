// Home (the hospitals, with their photos) and the favourites.
import { html, raw } from '../util.js';
import { S, X, VERSION, loginUrl } from '../data.js';
import { ICON, LOGO } from '../icons.js';
import { mapWord } from '../domain.js';
import { href } from '../router.js';
import { banner, tabbar, repCard } from './common.js';

export function viewOspedali() {
  const osps = S.data.ospedali;
  const live = navigator.serviceWorker?.controller && !S.offline;
  return html`
    ${banner()}
    <header class="hero home">
      <div class="row between">
        <div class="row gap10">
          <a class="logo" href="${href('home')}" aria-label="Pagina iniziale">${LOGO}</a>
          <div class="col">
            <span class="brand">Reparti <span class="serif-i">Ospedali</span></span>
          </div>
        </div>
        <div class="row gap8">
          <div class="status ${S.offline ? 'off' : ''}"><span class="dot"></span>${S.offline ? 'Offline' : live ? html`<span class="hide-sm">Disponibile offline</span><span class="show-sm">Offline ok</span>` : 'Online'}</div>
          ${S.me.canEdit && html`<a class="hbtn" href="${href('nuovoOspedale')}">${ICON.plus(20)}Nuovo</a>`}
        </div>
      </div>
      <h1>Dove devi portare il <span class="serif-i">paziente?</span></h1>
      <span class="hero-sub">Scegli l'ospedale</span>
    </header>
    <main class="scroll pad col gap14 hosp-list n${Math.min(osps.length, 3)}">
      ${osps.map((o, i) => {
        const sedi = X.sediByOsp[o.id] || [];
        const nrep = (X.repByOsp[o.id] || []).length;
        return html`<a class="hcard" href="${href('ospedale', o.id)}">
          ${o.foto ? html`<img src="${o.foto}" alt="" ${i === 0 ? raw('fetchpriority="high"') : raw('loading="lazy"')} decoding="async">` : html`<span class="hcard-ph">${ICON.hospital(56)}</span>`}
          <span class="hcard-shade"></span>
          <span class="hcard-num">${String(i + 1).padStart(2, '0')}<i>/</i>${o.citta || 'Ospedale'}</span>
          <span class="hcard-text">
            <b>${o.nome}</b>
            <span class="hcard-city">${[o.indirizzo, o.citta].filter(Boolean).join(', ')}</span>
            <span class="hcard-meta">${sedi.length} ${sedi.length === 1 ? 'sede' : 'sedi'} · ${nrep} reparti${o.mappa ? ' · ' + mapWord(o) : ''}</span>
          </span>
          <span class="hcard-go">${ICON.chevron()}</span>
        </a>`;
      })}
      ${!osps.length && html`<div class="empty"><b>Nessun ospedale</b><span>Aggiungi il primo ospedale per iniziare.</span></div>`}
      <p class="who">${S.me.user
        ? html`Accesso come <b>${S.me.user.name}</b> · ${S.me.canEdit ? 'puoi modificare' : 'sola lettura'} · <a href="/oauth2/sign_out?rd=%2F">Esci</a>`
        : html`Stai consultando senza accesso. <a href="${loginUrl()}">Accedi</a> solo se devi modificare i dati.`}<br>Versione ${VERSION}</p>
      ${S.me.user && !S.me.canEdit && html`<p class="who">Per modificare serve il ruolo ${(S.me.editorGroups || []).join(' o ')}. Ruoli ricevuti: ${S.me.user.groups?.length ? S.me.user.groups.join(', ') : 'nessuno'}.</p>`}
      <p class="madeby">Made with <span class="heart" aria-label="amore">♥</span> by <a href="https://kyrie.ee" target="_blank" rel="noopener">kyrie.ee</a></p>
    </main>
    ${tabbar('ospedali')}`;
}

export function viewPreferiti() {
  const list = [...S.fav].map((id) => X.rep[id]).filter(Boolean);
  return html`
    ${banner()}
    <header class="hero">
      <div class="col"><span class="brand">Preferiti</span><span class="brand-sub">Salvati su questo dispositivo</span></div>
    </header>
    <main class="scroll pad col gap10">
      ${list.map(repCard)}
      ${!list.length && html`<div class="empty"><b>Nessun preferito</b><span>Apri un reparto e tocca la stella per ritrovarlo qui.</span></div>`}
    </main>
    ${tabbar('preferiti')}`;
}
