// Pieces shared by every screen: banners, bottom/top bar, toast, ward card, not found.
import { html, raw, fmtDate } from '../util.js';
import { S, loginUrl } from '../data.js';
import { ICON, LOGO, repIcon } from '../icons.js';
import { pianoInfo, ingPill, ascPill, sedeLabel } from '../domain.js';
import { render } from '../ui.js';
import { href } from '../router.js';

export function banner() {
  if (S.sessionExpired) {
    return html`<div class="banner err">Sessione scaduta: per salvare le modifiche <a href="${loginUrl()}">accedi di nuovo</a>.</div>`;
  }
  if (S.offline) return html`<div class="banner warn">Offline: stai vedendo i dati salvati${S.data?.aggiornato ? ' (aggiornati al ' + fmtDate(S.data.aggiornato) + ')' : ''}.</div>`;
  return '';
}

// Light unless the dark theme was chosen in the app (the device setting is not followed).
export const isDark = () => document.documentElement.dataset.theme === 'dark';

export function tabbar(active) {
  const items = [
    ['ospedali', href('home'), 'Ospedali', ICON.hospital(22)],
    ['preferiti', href('preferiti'), 'Preferiti', ICON.star(22)]
  ];
  if (S.me.canEdit) items.push(['aggiungi', href('aggiungi'), 'Aggiungi', ICON.plus(22)]);
  // Login is optional (only needed to edit): offered while not logged in and online.
  else if (!S.me.user && !S.offline) items.push(['accedi', loginUrl(), 'Accedi', ICON.user(22)]);
  const dark = isDark();
  return html`<nav class="tabbar" style="grid-template-columns: repeat(${items.length + 1}, minmax(0, 1fr))">
    <a class="tab-brand" href="${href('home')}" aria-label="Reparti Ospedali, pagina iniziale">${LOGO}<span>Reparti <span class="serif-i">Ospedali</span></span></a>
    ${items.map(([k, to, label, icon]) => html`<a href="${to}" class="${k === active ? 'on' : ''} ${k === 'accedi' ? 'login' : ''}" ${k === active ? raw('aria-current="page"') : ''}>${icon}${label}</a>`)}
    <div class="themesw" role="group" aria-label="Tema">
      <button type="button" data-act="theme" data-t="light" aria-pressed="${!dark}" title="Tema chiaro">${ICON.sun(18)}<span>Chiaro</span></button>
      <button type="button" data-act="theme" data-t="dark" aria-pressed="${dark}" title="Tema scuro">${ICON.moon(18)}<span>Scuro</span></button>
    </div>
  </nav>`;
}

// A link for editors, plain text for everyone else (same content and class).
export function linkOrDiv(editable, to, cls, inner) {
  return editable ? html`<a class="${cls}" href="${to}">${inner}</a>` : html`<div class="${cls}">${inner}</div>`;
}

export function toast() {
  return S.flash ? html`<div class="toast ${S.flash.kind}" role="status">${S.flash.text}</div>` : '';
}

export function repCard(r) {
  const pi = pianoInfo(r._osp, r.piano);
  return html`<a class="rcard" href="${href('reparto', r.id)}">
    <div class="rcard-floor"><span>${pi.title}</span><b>${pi.short}</b></div>
    <div class="rcard-body">
      <span class="rcard-title"><span class="ricon xs">${repIcon(r, 16)}</span>${r.nome}</span>
      <span class="muted strong">${[r.tipo, r._osp?.nome].filter(Boolean).join(' · ')}</span>
      <span class="muted">${sedeLabel(r)}</span>
      <div class="pills">
        ${r._ing && html`<span class="pill red">${ICON.door()}${ingPill(r._ing)}</span>`}
        ${(r._asc || r.piano != null) && html`<span class="pill blue">${ICON.lift()}${ascPill(r._asc)}</span>`}
      </div>
    </div>
    <div class="rcard-go">${ICON.chevron()}</div>
  </a>`;
}

export function viewNotFound() {
  return html`${banner()}<header class="hero"><div class="row"><a class="hbtn" href="${href('home')}">${ICON.back()}Ospedali</a></div><h1>Non trovato</h1></header>
    <main class="scroll pad"><div class="empty"><b>Questa pagina non esiste più</b><span>Forse il dato è stato eliminato o rinominato.</span></div></main>${tabbar('')}`;
}

export function viewForbidden() {
  if (!S.me.user) {
    return html`${banner()}<header class="hero"><div class="row"><a class="hbtn" href="${href('home')}">${ICON.back()}Ospedali</a></div><h1>Accesso richiesto</h1></header>
      <main class="scroll pad"><div class="empty"><b>Per modificare i dati devi accedere</b><span>La consultazione è libera; aggiungere o modificare richiede un account con i permessi.</span><a class="btn primary" href="${loginUrl()}">Accedi</a></div></main>${tabbar('')}`;
  }
  return html`${banner()}<header class="hero"><div class="row"><a class="hbtn" href="${href('home')}">${ICON.back()}Ospedali</a></div><h1>Solo lettura</h1></header>
    <main class="scroll pad"><div class="empty"><b>Non hai i permessi per modificare i dati</b><span>Chiedi all'amministratore di aggiungerti al gruppo degli editor.</span></div></main>${tabbar('')}`;
}

export const handlers = {
  act: {
    // Light/dark, with the colour tokens fading over 0.4 s (as on kyrie.ee).
    theme: ({ t }) => {
      const root = document.documentElement;
      const next = t === 'dark' ? 'dark' : 'light';
      if (next === (isDark() ? 'dark' : 'light')) return;
      root.classList.add('theme-anim');
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#121316' : '#f2f1ee');
      setTimeout(() => root.classList.remove('theme-anim'), 450);
      render();
    },
  }
};
