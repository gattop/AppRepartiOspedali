// Glue between modules: re-rendering the page, short messages, and saving with feedback.
import { S, loadData } from './data.js';

export const $app = document.getElementById('app');

// app.js registers the real render(); modules call render() without importing app.js.
let renderer = () => {};
export const setRenderer = (fn) => { renderer = fn; };
export const render = () => renderer();

export function flash(text, kind = 'ok') {
  S.flash = { text, kind };
  render();
  clearTimeout(flash.t);
  flash.t = setTimeout(() => { S.flash = null; render(); }, 3500);
}

export async function mutate(fn, okText) {
  if (S.busy) return null;
  S.busy = true;
  try {
    const out = await fn();
    await loadData();
    if (okText) flash(okText);
    return out ?? true;
  } catch (e) {
    flash(e.message, 'err');
    return null;
  } finally {
    S.busy = false;
  }
}
