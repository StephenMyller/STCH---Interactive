/* Contextual side panel: formal derivations, figures, and supplementary notes.
   Figures and notes can be opened from inline LaTeX hyperlinks.
   Derivations retain their original button controls. */

function setupGentzenPanels() {
  const main = document.querySelector('main.bodycontainer');
  const shell = main?.parentElement;
  if (!shell || !main) return;
  shell.classList.add('bodyandsidetoc');

  const items = [...main.querySelectorAll(
    '.formalderivation, .sideillustration, .sidecommentary'
  )];
  if (items.length === 0) return;

  const panel = document.createElement('aside');
  panel.className = 'gentzen-panel';
  panel.id = 'gentzen-panel';
  panel.setAttribute('aria-label', 'Contextual derivations, illustrations, and notes');
  panel.setAttribute('aria-hidden', 'true');

  const card = document.createElement('div');
  card.className = 'gentzen-panel-card';
  const header = document.createElement('div');
  header.className = 'gentzen-panel-header';
  const title = document.createElement('strong');
  const close = document.createElement('button');
  close.className = 'gentzen-close';
  close.type = 'button';
  close.textContent = 'Close';
  header.append(title, close);

  const content = document.createElement('div');
  content.className = 'gentzen-panel-content';
  card.append(header, content);
  panel.append(card);
  shell.append(panel);

  const buttons = new Map();
  const anchors = new Map();
  const links = new Map(items.map(item => [item, []]));
  let active = null;

  const isFigure = item => item.classList.contains('sideillustration');
  const isNote = item => item.classList.contains('sidecommentary');
  const label = item => isFigure(item)
    ? 'illustration'
    : isNote(item) ? 'supplementary note' : 'formal derivation';

  // Lwarp's \hyperlink{side:ID}{...} creates a real HTML anchor.
  // Find its target rather than guessing the exact URL or Lwarp ID prefix.
  for (const link of main.querySelectorAll('a[href*="#"]')) {
    let id;
    try {
      id = decodeURIComponent(new URL(link.getAttribute('href'), document.baseURI).hash.slice(1));
    } catch {
      continue;
    }
    const target = document.getElementById(id);
    const item = target?.closest('.sideillustration, .sidecommentary');
    if (item && links.has(item)) links.get(item).push(link);
  }

  function alignWithContext() {
    if (!active || window.innerWidth < 1600) return;

    const anchor = anchors.get(active);
    if (!anchor) return;

    const visual = isFigure(active)
      ? (active.querySelector('img, svg') || active)
      : isNote(active)
        ? (active.querySelector('blockquote, p') || active)
        : (active.querySelector('p mjx-container') || active);

    // Reset before measuring to avoid inheriting the previous item's position.
    panel.style.setProperty('--gentzen-anchor', '0px');
    const inset = visual.getBoundingClientRect().top - card.getBoundingClientRect().top;
    const panelY = panel.getBoundingClientRect().top + window.scrollY;
    const anchorY = anchor.getBoundingClientRect().top + window.scrollY;
    const padding = parseFloat(getComputedStyle(panel).paddingTop) || 0;
    const offset = Math.max(0, anchorY - panelY - padding - inset);
    panel.style.setProperty('--gentzen-anchor', `${Math.round(offset)}px`);
  }

  function hidePanel() {
    if (active) {
      active.hidden = true;
      const button = buttons.get(active);
      if (button) {
        button.textContent = `Show ${label(active)}`;
        button.setAttribute('aria-expanded', 'false');
      }
      for (const link of links.get(active)) {
        link.classList.remove('side-panel-link-active');
        link.setAttribute('aria-expanded', 'false');
      }
      anchors.get(active)?.classList.remove('gentzen-linked-proof');
    }
    active = null;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    panel.style.removeProperty('--gentzen-anchor');
  }

  function toggleItem(item, anchor) {
    const wasOpen = active === item;
    hidePanel();
    if (wasOpen) return;

    active = item;
    item.hidden = false;
    if (anchor) anchors.set(item, anchor);
    if (item.classList.contains('formalderivation')) {
      anchors.get(item)?.classList.add('gentzen-linked-proof');
    }

    const button = buttons.get(item);
    if (button) {
      button.textContent = `Hide ${label(item)}`;
      button.setAttribute('aria-expanded', 'true');
    }
    for (const link of links.get(item)) {
      link.classList.add('side-panel-link-active');
      link.setAttribute('aria-expanded', 'true');
    }

    title.textContent = label(item).replace(/^./, letter => letter.toUpperCase());
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    content.scrollTop = 0;
    requestAnimationFrame(alignWithContext);
  }

  for (const item of items) {
    const derivation = item.classList.contains('formalderivation');
    let anchor = null;
    let proof = null;

       if (derivation) {
      // Associate a derivation with a preceding proof only
      // when no substantive content separates the two.
      proof = item.previousElementSibling;
      let checked = 0;
      while (proof && !proof.matches('.amsthmproof') && checked++ < 6) {
        if (
          proof.matches('h1, h2, h3, h4, h5, h6') ||
          proof.textContent.trim() !== '' ||
          proof.querySelector('img, svg, mjx-container, button')
        ) break;
        proof = proof.previousElementSibling;
      }
      if (!proof?.matches('.amsthmproof')) proof = null;
    } else {
      const previous = item.previousElementSibling;
      if (previous?.matches('p')) anchor = previous;
    }

    const itemLinks = links.get(item);
    if (!derivation && itemLinks.length) {
      // Inline references take the place of the illustration/note button.
      anchor = itemLinks[0];
      for (const link of itemLinks) {
        link.classList.add('side-panel-link');
        link.setAttribute('aria-controls', panel.id);
        link.setAttribute('aria-expanded', 'false');
        link.addEventListener('click', event => {
          if (event.defaultPrevented || event.button !== 0 ||
              event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          toggleItem(item, link);
        });
      }
    } else {
      // Derivations always have buttons; figures/notes without inline links do too.
      const trigger = document.createElement('div');
      trigger.className = 'derivation-trigger';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Show ${label(item)}`;
      button.setAttribute('aria-controls', panel.id);
      button.setAttribute('aria-expanded', 'false');
      trigger.append(button);
      (derivation ? (proof || item) : item).before(trigger);
      anchor ||= proof || trigger;
      buttons.set(item, button);
      button.addEventListener('click', () => toggleItem(item, anchor));
    }

    anchors.set(item, anchor || item);
    content.append(item);
    item.hidden = true;

    if (isFigure(item)) {
      for (const img of item.querySelectorAll('img')) {
        img.addEventListener('load', alignWithContext);
      }
    }
  }

  close.addEventListener('click', hidePanel);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hidePanel();
  });
  window.addEventListener('resize', alignWithContext);
  if ('ResizeObserver' in window) {
    new ResizeObserver(alignWithContext).observe(main);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const promise = window.MathJax?.startup?.promise;
  if (promise && typeof promise.then === 'function') {
    promise.then(setupGentzenPanels, setupGentzenPanels);
  } else {
    setupGentzenPanels();
  }
});

/* Collapsible Lwarp table of contents — unchanged. */
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('nav.sidetoc');
  if (!nav) return;

  const levels = [
    'tocpart', 'tocchapter', 'tocsection',
    'tocsubsection', 'tocsubsubsection',
    'tocparagraph', 'tocsubparagraph'
  ];

  const entries = [...nav.querySelectorAll('a')]
    .map(link => ({
      link,
      row: link.closest('p'),
      level: levels.findIndex(name =>
        link.classList.contains(name))
    }))
    .filter(entry => entry.row && entry.level >= 0);

  const stack = [];

  for (const entry of entries) {
    while (
      stack.length &&
      stack[stack.length - 1].level >= entry.level
    ) {
      stack.pop();
    }
    entry.parents = [...stack];
    stack.push(entry);
  }

  const onThisPage = entry =>
    new URL(entry.link.href).pathname === location.pathname;

  function refresh() {
    for (const entry of entries) {
      entry.row.hidden =
        entry.parents.some(parent => !parent.expanded);

      if (entry.toggle) {
        entry.toggle.textContent =
          entry.expanded ? '▾' : '▸';
        entry.toggle.setAttribute(
          'aria-expanded', String(entry.expanded));
      }
    }
  }

  for (const entry of entries) {
    const children = entries.filter(other =>
      other.parents.includes(entry));

    entry.row.classList.add('gentzen-toc-entry');
    entry.row.style.setProperty(
      '--toc-level', Math.max(0, entry.level - 2));

    entry.expanded =
      onThisPage(entry) || children.some(onThisPage);

    const control = document.createElement(
      children.length ? 'button' : 'span'
    );

    control.className = children.length
      ? 'gentzen-toc-toggle'
      : 'gentzen-toc-placeholder';

    if (children.length) {
      control.type = 'button';
      control.setAttribute(
        'aria-label',
        `Toggle ${entry.link.textContent.trim()}`
      );
      control.addEventListener('click', () => {
        entry.expanded = !entry.expanded;
        refresh();
      });
      entry.toggle = control;
    } else {
      control.setAttribute('aria-hidden', 'true');
    }

    entry.link.before(control);
  }

  refresh();
});



/* Move Lwarp's page navigation beneath the manuscript. */
document.addEventListener('DOMContentLoaded', () => {
  const main = document.querySelector('main.bodycontainer');

  const pager = document.querySelector(
    'footer .book-pagination, footer .book-page-navigation'
  );

  if (!main || !pager) return;

  // Use the class expected by our existing CSS.
  pager.classList.add('book-pagination');

  // Remember the original footer before moving the navigation.
  const footer = pager.closest('footer');

  // Move the links into the middle reading column.
  main.appendChild(pager);

  // Identify the Next button for right alignment.
  for (const link of pager.querySelectorAll('a')) {
    if (link.textContent.trim().toLowerCase().startsWith('next')) {
      link.classList.add('book-pagination-next');
    }
  }

  // Remove Lwarp's now-empty full-width footer.
  if (footer && !footer.textContent.trim()) {
    footer.remove();
  }
});



/* Reveal the manuscript after MathJax finishes typesetting. */
(() => {
  function reveal() {
    document.documentElement.classList.add('book-math-ready');
  }

  function waitForMathJax() {
    const promise = window.MathJax?.startup?.promise;

    if (promise && typeof promise.then === 'function') {
      promise.then(reveal, reveal);
    } else {
      reveal();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      waitForMathJax,
      { once: true }
    );
  } else {
    waitForMathJax();
  }
})();



/* Proof Explorer, phase 1: separate full-window, zoomable viewer.
   Append this block to assets/gentzen.js; no LaTeX or workflow changes. */
(() => {
  const PARAM = 'proof-explorer';

  const style = document.createElement('style');
  style.textContent = `
    .proof-explorer-launch {
      margin-right: .65rem; font: inherit; font-size: .82rem;
      text-decoration: none; color: inherit !important;
      border: 1px solid #a9a198; border-radius: .25rem;
      padding: .35rem .65rem;
    }
    .proof-explorer-launch:hover { background: #eeeae3; }
    html[data-book-theme="dark"] .proof-explorer-launch:hover { background: #343942; }
    .proof-explorer-overlay {
      position: fixed; inset: 0; z-index: 100000;
      display: flex; flex-direction: column;
      background: #f7f5f0; color: #202126;
      font-family: Georgia, 'Times New Roman', serif;
    }
    html[data-book-theme="dark"] .proof-explorer-overlay {
      background: #1c2026; color: #e8e9ed;
    }
    .proof-explorer-toolbar {
      display: flex; align-items: center; flex-wrap: wrap;
      gap: .6rem; padding: .75rem 1.25rem;
      border-bottom: 1px solid #c7c3bd;
      background: inherit;
    }
    html[data-book-theme="dark"] .proof-explorer-toolbar { border-color: #444b56; }
    .proof-explorer-title { font-size: 1.08rem; margin-right: auto; }
    .proof-explorer-toolbar button,
    .proof-explorer-toolbar a {
      font: inherit; font-size: .9rem; color: inherit !important;
      background: transparent; border: 1px solid #999;
      border-radius: .3rem; padding: .35rem .65rem;
      cursor: pointer; text-decoration: none;
    }
    .proof-explorer-toolbar button:hover,
    .proof-explorer-toolbar a:hover { background: #8882; }
    .proof-explorer-viewport {
      position: relative; flex: 1; min-height: 0;
      overflow: hidden; cursor: grab; touch-action: none;
    }
    .proof-explorer-viewport.dragging { cursor: grabbing; }
    .proof-explorer-stage {
      position: absolute; top: 0; left: 0;
      width: max-content; height: max-content;
      padding: 3rem; box-sizing: border-box;
      transform-origin: 0 0;
    }
    .proof-explorer-stage .formalderivation {
      display: block !important; width: max-content;
      max-width: none !important; overflow: visible !important;
    }
    .proof-explorer-stage .formalderivation > p {
      text-align: center !important; width: max-content;
      max-width: none; margin: 0;
    }
    .proof-explorer-stage mjx-container { color: inherit; }
    .proof-explorer-stage mjx-container svg a { color: inherit !important; }
    html.proof-explorer-mode body { overflow: hidden !important; }
  `;
  document.head.append(style);

  const originalPageURL = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM);
    return url;
  };

  function makeExplorer(proofs, requested) {
    const ordinal = Number(requested);
    const selected = Number.isSafeInteger(ordinal) && ordinal >= 1
      ? proofs[ordinal - 1] : undefined;

    const overlay = document.createElement('div');
    overlay.className = 'proof-explorer-overlay';
    const toolbar = document.createElement('header');
    toolbar.className = 'proof-explorer-toolbar';
    const heading = document.createElement('strong');
    heading.className = 'proof-explorer-title';
    heading.textContent = `Proof Explorer · ${ordinal}`;
    toolbar.append(heading);

    const button = (name, label) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.textContent = label;
      element.setAttribute('aria-label', name);
      toolbar.append(element);
      return element;
    };
    const minus = button('Zoom out', '−');
    const plus = button('Zoom in', '+');
    const fitButton = button('Fit proof to window', 'Fit');
    const back = document.createElement('a');
    back.textContent = 'Back to textbook';
    back.href = originalPageURL().href;
    toolbar.append(back);

    const viewport = document.createElement('main');
    viewport.className = 'proof-explorer-viewport';
    viewport.setAttribute('aria-label', 'Proof canvas');
    const stage = document.createElement('div');
    stage.className = 'proof-explorer-stage';
    viewport.append(stage);
    overlay.append(toolbar, viewport);
    document.body.append(overlay);
    document.documentElement.classList.add('proof-explorer-mode');

    if (!selected) {
      stage.textContent = 'This proof could not be found on this page.';
      minus.disabled = plus.disabled = fitButton.disabled = true;
      return;
    }
    // MOVE, don't clone: MathJax's SVG glyph definitions stay in this document.
    selected.hidden = false;
    stage.append(selected);

    let scale = 1;
    let x = 0;
    let y = 0;
    const paint = () => {
      stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    };
      stage.proofExplorerPanBy = (dx, dy) => {
      x += dx;
      y += dy;
      paint();
    };
    const fit = () => {
      const w = Math.max(stage.offsetWidth, 1);
      const h = Math.max(stage.offsetHeight, 1);
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      scale = Math.min(1, (vw - 48) / w, (vh - 48) / h);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
      x = (vw - w * scale) / 2;
      y = (vh - h * scale) / 2;
      paint();
    };
    const zoom = (factor, clientX, clientY) => {
      const rect = viewport.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const next = Math.max(0.05, Math.min(6, scale * factor));
      const ratio = next / scale;
      x = cx - (cx - x) * ratio;
      y = cy - (cy - y) * ratio;
      scale = next;
      paint();
    };
    const zoomInPlace = factor => {
      const r = viewport.getBoundingClientRect();
      zoom(factor, r.left + r.width / 2, r.top + r.height / 2);
    };
    minus.addEventListener('click', () => zoomInPlace(1 / 1.25));
    plus.addEventListener('click', () => zoomInPlace(1.25));
    fitButton.addEventListener('click', fit);
    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      zoom(Math.exp(-event.deltaY * 0.001), event.clientX, event.clientY);
    }, { passive: false });

    let dragging = null;
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('a, button')) return;
      dragging = { px: event.clientX, py: event.clientY, x, y };
      viewport.classList.add('dragging');
      viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove', event => {
      if (!dragging) return;
      x = dragging.x + event.clientX - dragging.px;
      y = dragging.y + event.clientY - dragging.py;
      paint();
    });
    const endDrag = () => {
      dragging = null;
      viewport.classList.remove('dragging');
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    // Internal proof links should return to the textbook, not scroll behind the overlay.
    stage.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || link.getAttribute('xlink:href');
      if (!href) return;
      const destination = new URL(href, window.location.href);
      if (destination.origin === location.origin &&
          destination.pathname === location.pathname) {
        destination.searchParams.delete(PARAM);
        event.preventDefault();
        location.assign(destination.href);
      }
    });

    requestAnimationFrame(fit);
  }

  function initialize() {
    // gentzen.js has already moved the derivations into this panel.
    const panel = document.getElementById('gentzen-panel');
    const proofs = panel ? [...panel.querySelectorAll('.formalderivation')] : [];
    const requested = new URLSearchParams(location.search).get(PARAM);
    if (requested !== null) {
      makeExplorer(proofs, requested);
      return;
    }
    if (!panel || !proofs.length) return;

    const header = panel.querySelector('.gentzen-panel-header');
    const close = header?.querySelector('.gentzen-close');
    if (!header || !close) return;
    const launch = document.createElement('a');
    launch.textContent = 'Open in Proof Explorer';
    launch.className = 'proof-explorer-launch';
    launch.target = '_blank';
    launch.rel = 'noopener';
    launch.hidden = true;
    header.insertBefore(launch, close);

    const refresh = () => {
      const active = proofs.find(proof => !proof.hidden);
      const show = Boolean(active && panel.classList.contains('is-open'));
      if (launch.hidden === show) launch.hidden = !show;
      if (!show) return;
      const url = originalPageURL();
      url.searchParams.set(PARAM, String(proofs.indexOf(active) + 1));
      url.hash = '';
      launch.href = url.href;
    };
    new MutationObserver(refresh).observe(panel, {
      attributes: true, subtree: true, attributeFilter: ['hidden', 'class']
    });
    refresh();
  }

  const start = () => {
    const promise = window.MathJax?.startup?.promise;
    if (promise?.then) {
      promise.then(() => requestAnimationFrame(initialize),
                   () => requestAnimationFrame(initialize));
    } else {
      requestAnimationFrame(initialize);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();


/* Proof Explorer 0.2: show a separately authored full derivation when supplied.
   Append AFTER the existing Proof Explorer add-on in assets/gentzen.js. */
(() => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('proof-explorer')) return;

  function replaceWithFullProof() {
    const stage = document.querySelector('.proof-explorer-stage');
    const snippet = stage?.querySelector(':scope > .formalderivation');
    if (!snippet) return false; // The original explorer has not opened yet.

    const key = snippet.style.getPropertyValue('--explorer-id').trim();
    if (!key) return true; // No separate version: keep the existing behavior.

    const matches = [...document.querySelectorAll('.explorerderivation')]
      .filter(el => el.style.getPropertyValue('--explorer-id').trim() === key);

    if (matches.length !== 1) {
      console.warn(
        `Proof Explorer: expected one full derivation for "${key}", found ${matches.length}. ` +
        'Showing the sidebar derivation instead.'
      );
      return true;
    }

    const full = matches[0];
    snippet.replaceWith(full); // Move rather than clone; preserve MathJax SVG data.
    full.hidden = false;

    // The original explorer has already fitted the snippet. Refit the full tree.
    requestAnimationFrame(() => {
      document.querySelector(
        '.proof-explorer-toolbar button[aria-label="Fit proof to window"]'
      )?.click();
    });
    return true;
  }

  function start() {
    if (replaceWithFullProof()) return;
    const observer = new MutationObserver(() => {
      if (replaceWithFullProof()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();



/* Proof Explorer 0.6.1 — registered unary and binary rule expansion.
   REPLACES the complete 0.5 expansion add-on (the final IIFE).
   Keep viewer 0.1, full-proof substitution 0.2 and proofExplorerPanBy.
   Registry version 2 is generated by scripts/build_proof_registry.py.
   This explores authored proofs; it does not verify logical correctness. */
(() => {
  'use strict';
  if (!new URLSearchParams(location.search).has('proof-explorer')) return;

  const LINK_PREFIX = '#proof-expand-rule-';
  const style = document.createElement('style');
  style.textContent = `
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"] { cursor: zoom-in; }
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"]:hover { opacity: .62; }
    .proof-explorer-expansion-note { font: inherit; font-size: .85rem; opacity: .85; }
    .proof-explorer-toolbar button:disabled { opacity: .4; cursor: default; }
  `;
  document.head.append(style);

  function braced(text, from) {
    let i = from;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== '{') return null;
    const start = i;
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === '\\' && (text[i + 1] === '{' || text[i + 1] === '}')) {
        i++;
        continue;
      }
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        return {content: text.slice(start + 1, i), start, end: i + 1};
      }
    }
    return null;
  }

  // Tokenwise substitution: do not replace symbols inside command names.
  // As in v0.5, schematic metavariables are single (possibly indexed) symbols.
  const TOKEN = /\\[A-Za-z@]+|\\.|[A-Za-z](?:_\{?[0-9]+\}?)?|[0-9]+|\s+|[^\s]/g;
  const SIMPLE_VAR = /^[A-Za-z](?:_\{?[0-9]+\}?)?$/;
  function mathTokens(source) {
    const s = source.trim()
      .replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '')
      .replace(/^\$\s*/, '').replace(/\s*\$$/, '');
    return (s.match(TOKEN) || []).filter(token => !/^\s+$/.test(token));
  }

  function unify(schematic, actual, metavariables, bindings) {
    const lhs = mathTokens(schematic);
    const rhs = mathTokens(actual);
    if (lhs.length !== rhs.length) return false;
    for (let i = 0; i < lhs.length; i++) {
      const expected = lhs[i];
      const value = rhs[i];
      if (!metavariables.includes(expected)) {
        if (expected !== value) return false;
      } else {
        if (!SIMPLE_VAR.test(value)) return false;
        if (bindings[expected] !== undefined && bindings[expected] !== value) return false;
        bindings[expected] = value;
      }
    }
    return true;
  }

  function matchRule(rule, premises, conclusion) {
    if (premises.length !== rule.premises.length) return null;
    // The two premises of a binary inference may be displayed in either order.
    // Record which actual subtree belongs in each schematic premise slot.
    const orders = [premises.map((_, i) => i)];
    if (premises.length === 2) orders.push([1, 0]);
    for (const order of orders) {
      const bindings = Object.create(null);
      const premisesMatch = rule.premises.every((schema, i) =>
        unify(schema, premises[order[i]], rule.vars, bindings)
      );
      if (premisesMatch && unify(rule.conclusion, conclusion, rule.vars, bindings)) {
        return {bindings, order};
      }
    }
    return null;
  }

  function substituteFormula(formula, substitutions) {
    return formula.replace(TOKEN, token =>
      Object.prototype.hasOwnProperty.call(substitutions, token)
        ? substitutions[token] : token
    );
  }

  // Locate inference nodes by executing the bussproofs stack operations.
  // For each subtree, retain the actual TeX source span: this is what must be
  // grafted into the defining derivation, not just the premise's last formula.
  function findApplications(source, rules) {
    const stack = [];
    const hits = [];
    let label = null;
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL)\b/g;
    let match;
    while ((match = command.exec(source))) {
      const name = match[1];
      const arg = braced(source, command.lastIndex);
      if (!arg) continue;
      command.lastIndex = arg.end;
      if (name === 'RightLabel' || name === 'RL') {
        label = {value: arg.content.trim(), start: match.index,
                 end: arg.end, command: name};
        continue;
      }
      if (name === 'AxiomC') {
        stack.push({formula: arg.content, start: match.index, end: arg.end});
        label = null;
        continue;
      }
      const arity = {
        UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
        QuaternaryInfC: 4, QuinaryInfC: 5
      }[name];
      if (!arity || stack.length < arity) {
        label = null;
        continue;
      }
      const branches = stack.splice(-arity, arity);
      if (label) {
        const rule = rules.find(item => item.label === label.value &&
          item.premises.length === arity);
        const matched = rule && matchRule(
          rule, branches.map(branch => branch.formula), arg.content
        );
        if (matched) {
          hits.push({
            id: hits.length, rule, bindings: matched.bindings,
            start: branches[0].start, end: arg.end,
            labelStart: label.start, labelEnd: label.end,
            labelCommand: label.command,
            premiseSources: matched.order.map(i => source.slice(branches[i].start, branches[i].end)),
            originalConclusion: arg.content
          });
        }
      }
      stack.push({formula: arg.content, start: branches[0].start, end: arg.end});
      label = null;
    }
    return hits;
  }

  function markExpandableRules(source, rules) {
    const hits = findApplications(source, rules);
    let result = source;
    // Only replace each label, never entire overlapping nested subtrees.
    for (const hit of hits.slice().reverse()) {
      const marker = `\\${hit.labelCommand}{\\href{${LINK_PREFIX}${hit.id}}{${hit.rule.label}}}`;
      result = result.slice(0, hit.labelStart) + marker + result.slice(hit.labelEnd);
    }
    return {tex: result, hits};
  }

  function freshSubstitutions(source, hit) {
    const substitutions = Object.assign(Object.create(null), hit.bindings);
    // Look for variables in mathematical formulas, not in rule labels,
    // URLs or words such as "Subset-Trans" (those are not occupied variables).
    const used = new Set();
    const formulas = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC)\b/g;
    let command;
    while ((command = formulas.exec(source))) {
      const arg = braced(source, formulas.lastIndex);
      if (!arg) continue;
      formulas.lastIndex = arg.end;
      for (const token of mathTokens(arg.content)) {
        if (SIMPLE_VAR.test(token)) used.add(token);
      }
    }
    const lower = ['a', 'b', 'c', 'x', 'y', 'z'];
    const upper = ['A', 'B', 'C', 'X', 'Y', 'Z'];
    for (const local of hit.rule.fresh) {
      const isUpper = /^[A-Z]/.test(local);
      const options = isUpper ? upper : lower;
      let candidate = options.find(variable => !used.has(variable));
      if (!candidate) {
        const stem = isUpper ? 'Z' : 'z';
        let next = 0;
        do { candidate = `${stem}_{${next++}}`; } while (used.has(candidate));
      }
      used.add(candidate);
      substitutions[local] = candidate;
    }
    return substitutions;
  }

  // Substitute only the actual formula arguments, not rule names, hyperlinks,
  // label numbers or filenames. Preserve the original final conclusion verbatim.
  function instantiateTemplate(template, substitutions, originalConclusion) {
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC)\b/g;
    const found = [];
    let match;
    while ((match = command.exec(template))) {
      const arg = braced(template, command.lastIndex);
      if (!arg) throw new Error('Bad formula argument in registered derivation');
      found.push({name: match[1], arg});
      command.lastIndex = arg.end;
    }
    const last = found.length - 1;
    let rewritten = template;
    for (let i = last; i >= 0; i--) {
      const {name, arg} = found[i];
      const formula = (i === last && name !== 'AxiomC')
        ? originalConclusion : substituteFormula(arg.content, substitutions);
      rewritten = rewritten.slice(0, arg.start + 1) + formula +
        rewritten.slice(arg.end - 1);
    }
    return rewritten;
  }

  function expandOnce(source, id, rules) {
    const hit = findApplications(source, rules).find(item => item.id === id);
    if (!hit) return null;
    const substitutions = freshSubstitutions(source, hit);
    let replacement = instantiateTemplate(
      hit.rule.template, substitutions, hit.originalConclusion
    );
    for (let i = 0; i < hit.premiseSources.length; i++) {
      const placeholder = `@@PE_PREMISE_${i}@@`;
      if (!replacement.includes(placeholder)) {
        throw new Error(`Missing premise slot ${i+1} in registered proof`);
      }
      replacement = replacement.replace(placeholder, hit.premiseSources[i]);
    }
    if (replacement.includes('@@PE_PREMISE_')) {
      throw new Error('Unresolved premise slot in registered proof');
    }
    return source.slice(0, hit.start) + replacement + source.slice(hit.end);
  }

  function locateExplorerMath(stage) {
    const math = window.MathJax?.startup?.document?.math;
    if (!math) return null;
    for (const item of math) {
      if (item.typesetRoot && stage.contains(item.typesetRoot) &&
          /\\begin\s*\{prooftree\}/.test(item.math)) return item;
    }
    return null;
  }

  function initialize(stage, item, rules) {
    const texEngine = window.MathJax;
    if (typeof texEngine?.tex2svgPromise !== 'function') {
      console.warn('Proof Explorer: MathJax SVG renderer unavailable.');
      return;
    }
    const toolbar = document.querySelector('.proof-explorer-toolbar');
    if (!toolbar) return;
    const fit = toolbar.querySelector('button[aria-label="Fit proof to window"]');
    let output = item.typesetRoot;
    let source = item.math;
    const history = [];
    let busy = false;

    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo expansion';
    undo.disabled = true;
    const hint = document.createElement('span');
    hint.className = 'proof-explorer-expansion-note';
    hint.setAttribute('role', 'status');
    toolbar.insertBefore(undo, fit || toolbar.firstChild);
    toolbar.insertBefore(hint, fit || toolbar.firstChild);

    async function render() {
      const prepared = markExpandableRules(source, rules);
      const replacement = await texEngine.tex2svgPromise(prepared.tex, {display: true});
      if (!replacement?.querySelector('svg') ||
          replacement.querySelector('merror, [data-mml-node="merror"]')) {
        throw new Error('MathJax failed to render the proof');
      }
      const oldBox = output.querySelector('svg')?.getBoundingClientRect();
      output.replaceWith(replacement);
      output = replacement;
      const newBox = replacement.querySelector('svg')?.getBoundingClientRect();
      if (oldBox && newBox && stage.proofExplorerPanBy) {
        stage.proofExplorerPanBy(
          (oldBox.left + oldBox.right - newBox.left - newBox.right) / 2,
          oldBox.bottom - newBox.bottom
        );
      }
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
          typeof replacement.animate === 'function') {
        replacement.animate([{opacity: .15}, {opacity: 1}],
          {duration: 200, easing: 'ease-out'});
      }
      hint.textContent = prepared.hits.length
        ? `Click a derived rule to expand it (${prepared.hits.length} available).`
        : history.length ? 'No further registered expansions in this tree.'
          : 'No registered expandable rules in this tree.';
      undo.disabled = history.length === 0;
    }

    async function change(next, revert = false) {
      if (busy) return;
      busy = true;
      const before = source;
      const previousHistory = history.slice();
      source = next;
      if (revert) history.pop();
      else history.push(before);
      try {
        await render();
      } catch (error) {
        source = before;
        history.splice(0, history.length, ...previousHistory);
        undo.disabled = history.length === 0;
        hint.textContent = 'Could not redraw the tree; original kept.';
        console.error('Proof Explorer expansion:', error);
      } finally {
        busy = false;
      }
    }

    stage.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      const href = link?.getAttribute('href');
      if (!href?.startsWith(LINK_PREFIX)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = Number(href.slice(LINK_PREFIX.length));
      if (!Number.isSafeInteger(id)) return;
      try {
        const next = expandOnce(source, id, rules);
        if (next) change(next);
      } catch (error) {
        hint.textContent = 'Could not expand this rule; proof unchanged.';
        console.error('Proof Explorer expansion:', error);
      }
    }, true);
    undo.addEventListener('click', () => {
      if (busy || !history.length) return;
      change(history[history.length - 1], true);
    });

    render().catch(error => {
      hint.textContent = 'Expansion is unavailable for this tree.';
      console.warn('Proof Explorer:', error);
    });
  }

  function start(rules) {
    const stage = document.querySelector('.proof-explorer-stage');
    if (!stage) return false;
    const snippet = stage.querySelector(':scope > .formalderivation');
    const key = snippet?.style.getPropertyValue('--explorer-id').trim();
    if (key && [...document.querySelectorAll('.explorerderivation')]
      .some(el => el.style.getPropertyValue('--explorer-id').trim() === key)) return false;
    const item = locateExplorerMath(stage);
    if (!item) return false;
    initialize(stage, item, rules);
    return true;
  }

  async function waitForExplorer() {
    const url = new URL('assets/proof-rules.json', location.href);
    let data;
    try {
      const response = await fetch(url, {cache: 'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      if (data.version !== 2 || !data.rules) {
        throw new Error('Unknown rule registry format (expected version 2)');
      }
    } catch (error) {
      console.warn('Proof Explorer: rule registry unavailable:', error);
      return;
    }
    const rules = Object.values(data.rules);
    if (start(rules)) return;
    const observer = new MutationObserver(() => {
      if (start(rules)) observer.disconnect();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    setTimeout(() => observer.disconnect(), 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForExplorer, {once: true});
  } else {
    waitForExplorer();
  }
})();
