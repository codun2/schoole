/*
 * سكوول — lightweight retrofit i18n for a no-build Arabic SPA.
 * Strategy: the UI is authored in Arabic; when English is selected we translate
 * the live DOM (text nodes + placeholder/title attributes) against an Arabic→English
 * dictionary (window.SCH_DICT), and keep translating dynamically-rendered content
 * via a MutationObserver. Direction flips to LTR. Switching language reloads the
 * page so Arabic is re-rendered from source before (optionally) re-translating.
 *
 * Only EXACT (trimmed) matches are translated, so interpolated/data values are
 * never partially rewritten. Unknown strings stay Arabic — the dictionary grows
 * over time without touching page code.
 */
(function () {
  'use strict';
  const S = (window.S = window.S || {});
  const KEY = 'sch_lang';
  const DICT = () => window.SCH_DICT || {};
  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1 };

  S.lang = () => { try { return localStorage.getItem(KEY) || 'ar'; } catch { return 'ar'; } };
  S.isEn = () => S.lang() === 'en';

  function translateString(raw) {
    const d = DICT();
    const key = raw.trim();
    if (!key) return raw;
    const hit = d[key];
    if (hit == null) return raw;
    // replace the trimmed text in place, preserving any surrounding whitespace
    return raw.replace(key, hit);
  }

  function translateTextNode(n) {
    const p = n.parentNode;
    if (!p || SKIP_TAGS[p.nodeName]) return;
    const v = n.nodeValue;
    if (!v || !v.trim()) return;
    const t = translateString(v);
    if (t !== v) n.nodeValue = t;
  }

  function translateEl(el) {
    if (el.nodeType !== 1) return;
    ['placeholder', 'title'].forEach((a) => {
      const v = el.getAttribute && el.getAttribute(a);
      if (v) { const t = translateString(v); if (t !== v) el.setAttribute(a, t); }
    });
  }

  function translateRoot(root) {
    if (!S.isEn() || !root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    // text nodes
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const batch = [];
    while (walker.nextNode()) batch.push(walker.currentNode);
    batch.forEach(translateTextNode);
    // attributes on the root + descendants
    if (root.getAttribute) translateEl(root);
    if (root.querySelectorAll) root.querySelectorAll('[placeholder],[title]').forEach(translateEl);
  }
  S.i18nApply = () => translateRoot(document.body);

  function applyDir() {
    const en = S.isEn();
    document.documentElement.lang = en ? 'en' : 'ar';
    document.documentElement.dir = en ? 'ltr' : 'rtl';
  }

  let observer = null;
  function startObserver() {
    if (observer || !window.MutationObserver) return;
    observer = new MutationObserver((muts) => {
      if (!S.isEn()) return;
      for (const m of muts) {
        if (m.type === 'characterData') { translateTextNode(m.target); continue; }
        m.addedNodes.forEach((node) => translateRoot(node));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /** Call once after the shell/page has rendered (idempotent). */
  S.i18nStart = function () {
    applyDir();
    if (S.isEn()) { translateRoot(document.body); startObserver(); }
  };

  /** Toggle language and reload so Arabic source re-renders cleanly. */
  S.toggleLang = function () {
    try { localStorage.setItem(KEY, S.isEn() ? 'ar' : 'en'); } catch {}
    location.reload();
  };
  S.setLang = function (l) {
    try { localStorage.setItem(KEY, l === 'en' ? 'en' : 'ar'); } catch {}
    location.reload();
  };

  // Flip dir as early as possible (before shell render) to avoid a flash.
  applyDir();
})();
