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



/* Proof Explorer 0.3 — first genuine, reversible one-step expansion.
   Append this AFTER the two existing Proof Explorer add-ons in assets/gentzen.js.
   For now only Set-I applied to x \in Y (simple variables) can be expanded.
   The sidebar, LaTeX source, and PDF are never changed. */
(() => {
  'use strict';
  if (!new URLSearchParams(location.search).has('proof-explorer')) return;

  const LINK_PREFIX = '#proof-expand-seti-';
  const style = document.createElement('style');
  style.textContent = `
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"] {cursor: zoom-in;}
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"]:hover {opacity: .62;}
    .proof-explorer-expansion-note {
      font: inherit; font-size: .85rem; opacity: .85;
    }
    .proof-explorer-toolbar button:disabled {opacity: .4; cursor: default;}
  `;
  document.head.append(style);

  function braced(text, from) {
    let i = from;
    while (/\s/.test(text[i] || '') && i < text.length) i++;
    if (text[i] !== '{') return null;
    const open = i;
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === '\\' && (text[i + 1] === '{' || text[i + 1] === '}')) {
        i++; // Literal escaped brace, not structural.
        continue;
      }
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        return {content: text.slice(open + 1, i), start: open, end: i + 1};
      }
    }
    return null;
  }

  function simplifiedFormula(tex) {
    return tex.trim()
      .replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '')
      .replace(/^\$\s*/, '').replace(/\s*\$$/, '')
      .replace(/\s+/g, '');
  }

  function setIInstance(premise, conclusion) {
    const subject = '[A-Za-z](?:_\\{?[0-9]+\\}?)?';
    const result = simplifiedFormula(conclusion).match(
      new RegExp('^\\\\Set\\((' + subject + ')\\)$')
    );
    const antecedent = simplifiedFormula(premise).match(
      new RegExp('^(' + subject + ')\\\\in.+$')
    );
    if (!result || !antecedent || result[1] !== antecedent[1]) return null;
    return result[1];
  }

  // Parse the proof's stack operations to locate *genuine* Set-I applications.
  // We do not trust the label alone: premise and conclusion must match Set-I.
  function findSetI(source) {
    const stack = [];
    const hits = [];
    let rightLabel = null;
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL)\b/g;
    let match;
    while ((match = command.exec(source))) {
      const name = match[1];
      const arg = braced(source, command.lastIndex);
      if (!arg) continue;
      command.lastIndex = arg.end;

      if (name === 'RightLabel' || name === 'RL') {
        rightLabel = {value: arg.content.trim(), start: match.index, end: arg.end, cmd: name};
        continue;
      }
      if (name === 'AxiomC') {
        stack.push({formula: arg.content});
        rightLabel = null;
        continue;
      }
      const arity = {
        UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
        QuaternaryInfC: 4, QuinaryInfC: 5
      }[name];
      if (!arity || stack.length < arity) {
        rightLabel = null;
        continue;
      }
      const premises = stack.splice(-arity, arity);
      if (arity === 1 && rightLabel?.value === 'Set-I') {
        const variable = setIInstance(premises[0].formula, arg.content);
        if (variable) {
          hits.push({
            id: hits.length, variable,
            start: rightLabel.start, end: arg.end,
            originalConclusion: arg.content
          });
        }
      }
      stack.push({formula: arg.content});
      rightLabel = null;
    }
    return hits;
  }

  function markExpandableRules(source) {
    const hits = findSetI(source);
    let result = source;
    for (const hit of hits.slice().reverse()) {
      const original = result.slice(hit.start, hit.end);
      const marked = original.replace(
        /\\(RightLabel|RL)\s*\{\s*Set-I\s*\}/,
        (_, command) => `\\${command}{\\href{${LINK_PREFIX}${hit.id}}{Set-I}}`
      );
      result = result.slice(0, hit.start) + marked + result.slice(hit.end);
    }
    return {tex: result, hits};
  }

     function definitionRef(label) {
    const node = document.getElementById('gentzen-reference-index');
    if (!node) return 'D(Set)';

    try {
      const entry = JSON.parse(node.textContent)[label];
      if (!entry) return 'D(Set)';

      const [number, filename] = entry;
      const here = decodeURIComponent(
        location.pathname.split('/').pop() || 'index.html'
      );
      const url = (filename === here ? '' : filename) + '#' + label;

      return `D\\href{${url}}{${number}}`;
    } catch (error) {
      console.warn('Cannot resolve definition:', label, error);
      return 'D(Set)';
    }
  }
   
  function expandOnce(source, index) {
    const hit = findSetI(source).find(item => item.id === index);
    if (!hit) return null;
    // Fresh bound variable: do not bind the subject of the original inference.
    const witnessVariable = ['Z', 'Y', 'X', 'W', 'C'].find(v => v !== hit.variable);
    const x = hit.variable;
    const expansion = String.raw`\RightLabel{\(\exists\)-I}
\UnaryInfC{\(\exists ${witnessVariable}(${x}\in ${witnessVariable})\)}
\RightLabel{${definitionRef('def:set')}}
\dashedLine
\UnaryInfC{${hit.originalConclusion}}`;
    return source.slice(0, hit.start) + expansion + source.slice(hit.end);
  }

  function locateExplorerMath(stage) {
    const math = window.MathJax?.startup?.document?.math;
    if (!math) return null;
    for (const item of math) {
      if (item.typesetRoot && stage.contains(item.typesetRoot) &&
          /\\begin\s*\{prooftree\}/.test(item.math) &&
          findSetI(item.math).length) {
        return item;
      }
    }
    return null;
  }

  function initialize(stage, item) {
    const texEngine = window.MathJax;
    if (typeof texEngine?.tex2svgPromise !== 'function') {
      console.warn('Proof Explorer: MathJax SVG renderer not available for expansion.');
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
      const prepared = markExpandableRules(source);
      // Build the replacement first; keep the existing tree if MathJax fails.
      const replacement = await texEngine.tex2svgPromise(prepared.tex, {display: true});
      if (!replacement?.querySelector('svg') || replacement.querySelector('merror, [data-mml-node="merror"]')) {
        throw new Error('MathJax failed to render the expanded proof');
      }
      output.replaceWith(replacement);
      output = replacement;
      hint.textContent = prepared.hits.length
        ? 'Click Set-I in the tree to expand it.'
        : history.length ? 'Set-I expanded.' : 'No expandable Set-I applications.';
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
      event.stopImmediatePropagation(); // Prevent the existing viewer's textbook navigation.
      const id = Number(href.slice(LINK_PREFIX.length));
      if (!Number.isSafeInteger(id)) return;
      const next = expandOnce(source, id);
      if (next) change(next);
    }, true);

    undo.addEventListener('click', () => {
      if (busy || !history.length) return;
      change(history[history.length - 1], true);
    });

    render().catch(error => {
      hint.textContent = 'Proof expansion is unavailable for this tree.';
      console.warn('Proof Explorer:', error);
    });
  }

  function start() {
    const stage = document.querySelector('.proof-explorer-stage');
    if (!stage) return false;
    const snippet = stage.querySelector(':scope > .formalderivation');
    const key = snippet?.style.getPropertyValue('--explorer-id').trim();
    // Wait for the 0.2 add-on to substitute the full version, if supplied.
    if (key && [...document.querySelectorAll('.explorerderivation')]
      .some(el => el.style.getPropertyValue('--explorer-id').trim() === key)) return false;
    const item = locateExplorerMath(stage);
    if (!item) return false;
    initialize(stage, item);
    return true;
  }

  function waitForExplorer() {
    if (start()) return;
    const observer = new MutationObserver(() => {
      if (start()) observer.disconnect();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    // A page without Set-I is entirely normal; don't keep observing forever.
    setTimeout(() => observer.disconnect(), 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForExplorer, {once: true});
  } else {
    waitForExplorer();
  }
})();
