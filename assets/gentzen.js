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
    /* Every premise reserves its complete recursive width, including rule labels.
       Inference labels are in normal flow and cannot overlap neighboring branches. */
    .proof-explorer-stage .pe-tree, .proof-explorer-stage .pe-node {
      display: inline-flex; flex-direction: column; align-items: center;
      width: max-content; max-width: none; flex: 0 0 auto; white-space: nowrap;
    }
    .proof-explorer-stage .pe-tree { padding: 1rem; font-size: 1.1rem; }
    .proof-explorer-stage .pe-premises {
      display: flex; align-items: flex-end; justify-content: center;
      gap: 1.75em; width: max-content;
    }
    .proof-explorer-stage .pe-step {
      display: flex; flex-direction: column; align-items: center;
      width: 100%; min-width: max-content;
    }
    .proof-explorer-stage .pe-rule-row {
      display: flex; position: relative; align-items: center; gap: .3em;
      width: 100%; min-height: .35em;
    }
    /* The flex spacer reserves the original layout width; only its painted
       segment is trimmed. No premise, conclusion, or subtree is reflowed. */
    .proof-explorer-stage .pe-bar {
      height: 0; min-width: 1.25em; flex: 1 1 auto;
    }
    /* Inference rules are drawn in a viewport-level SVG, NOT as CSS borders
       inside the transformed proof stage. This prevents subpixel rasterization
       from making arbitrary rules disappear while zooming or panning. */
    .proof-explorer-viewport > .pe-inference-lines {
      position: absolute; inset: 0; width: 100%; height: 100%;
      pointer-events: none; overflow: hidden; z-index: 1;
    }
    .proof-explorer-viewport > .pe-inference-lines path {
      fill: none; stroke: currentColor; stroke-opacity: .62;
      stroke-linecap: butt; shape-rendering: crispEdges;
    }
    .proof-explorer-stage .pe-label {
      display: inline-flex; flex: 0 0 auto; min-height: 1em;
      align-items: center; line-height: 1;
      font-size: .70em; /* match the manuscript's scriptsize labels */
    }
    .proof-explorer-stage .pe-label a {
      color: inherit; text-decoration: none; cursor: pointer;
    }
    .proof-explorer-stage .pe-label a[href^='#proof-expand-'] { cursor: zoom-in; }
    .proof-explorer-stage .pe-label a:hover { opacity: .72; }
    .proof-explorer-stage .pe-conclusion {
      display: flex; justify-content: center; align-items: center;
      min-width: max-content; min-height: 1.1em;
    }
    .proof-explorer-stage .pe-leaf > .pe-conclusion:empty {
      min-width: 0; min-height: 0;
    }
    .proof-explorer-stage .pe-tree mjx-container {
      display: inline-block !important; margin: 0 !important;
      overflow: visible !important;
    }
    .proof-explorer-stage .pe-tree mjx-container svg { overflow: visible; }
    /* Explorer actions are grouped by purpose; status and provenance are quiet. */
    /* Until the registry-dependent controls initialize, keep the original
       viewer's zoom/return controls in a readable horizontal toolbar. */
    .proof-explorer-toolbar { display: flex; flex-direction: row; align-items: center;
      flex-wrap: wrap; gap: .5rem; padding: .5rem 1rem; }
    .proof-explorer-toolbar:has(> .pe-toolbar-head) {
      flex-direction: column; align-items: stretch; flex-wrap: nowrap; gap: .4rem;
    }
    .pe-explorer-warning { font-size: .85rem; opacity: .85; flex: 1 1 100%;
      padding: .25rem 0; }
    .pe-toolbar-head, .pe-toolbar-actions, .pe-toolbar-status {
      display: flex; gap: .7rem; align-items: center; flex-wrap: wrap;
    }
    .pe-toolbar-head { justify-content: space-between; }
    .pe-toolbar-actions { justify-content: space-between; }
    .pe-toolbar-action-group { display: inline-flex; gap: .35rem; align-items: center; }
    .pe-toolbar-status { min-height: 1.1em; font-size: .85rem; opacity: .75; }
    .pe-toolbar-status .proof-explorer-expansion-note,
    .pe-toolbar-status .proof-explorer-provenance { font-size: inherit; margin: 0; }
    .pe-expanded-count { font-size: .78rem; opacity: .7; margin-left: .4rem; }
    .pe-workspace { display: flex; flex: 1 1 auto; min-height: 0; }
    .pe-workspace > .proof-explorer-viewport { flex: 1 1 auto; min-width: 0; }
    .pe-dependency-panel { box-sizing: border-box; width: 325px; min-width: 250px;
      max-width: min(40vw, 430px); overflow-y: auto; padding: 1rem;
      border-left: 1px solid #a9a198; background: inherit; font: inherit; }
    .pe-dependency-panel[hidden] { display: none !important; }
    html[data-book-theme="dark"] .pe-dependency-panel { border-color: #444b56; }
    .pe-dependency-panel h2 { font-size: 1rem; margin: 0 0 .6rem; }
    .pe-dependency-tabs { display: flex; gap: .4rem; margin-bottom: .7rem; }
    .pe-dependency-tabs button { flex: 1; font: inherit; padding: .3rem .5rem;
      border: 1px solid #888; background: transparent; color: inherit; border-radius: .3rem; cursor: pointer; }
    .pe-dependency-tabs button[aria-selected="true"] { background: #8883; font-weight: bold; }
    .pe-dependency-list { margin: 0; padding: 0; list-style: none; }
    .pe-dependency-list li { margin: .3rem 0; padding: .3rem 0; }
    .pe-dependency-list a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .pe-dependency-category { font-size: .72rem; text-transform: uppercase;
      letter-spacing: .055em; opacity: .65; display: block; margin-bottom: .12rem; }
    .pe-dependency-note { font-size: .8rem; opacity: .75; margin: .8rem 0; line-height: 1.45; }
    .pe-dependency-empty { font-size: .9rem; opacity: .8; }
    /* An axiom-first summary above a navigable result-dependency hierarchy. */
    .pe-dependency-heading { display: flex; gap: .45rem; align-items: center;
      position: relative; }
    .pe-dependency-help > summary { display: flex; justify-content: center;
      align-items: center; border: 1px solid #8888; border-radius: 50%;
      width: 1.35rem; height: 1.35rem; cursor: pointer; font-size: .72rem;
      list-style: none; user-select: none; }
    .pe-dependency-help > summary::-webkit-details-marker { display: none; }
    .pe-dependency-help > p { box-sizing: border-box; position: absolute;
      right: 0; top: 1.5rem; z-index: 4; width: min(300px, 95%);
      border: 1px solid #8888; border-radius: .35rem; padding: .7rem;
      font-size: .82rem; line-height: 1.45;
      background: #f8f9fa; color: #171717; box-shadow: 0 5px 14px #0003; }
    html[data-book-theme="dark"] .pe-dependency-help > p {
      background: #282d35; color: #f4f4f4; }
    .pe-foundations { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem;
      margin: .6rem 0 .5rem; }
    .pe-foundation-axiom { border: 1px solid #8888; border-radius: .35rem;
      padding: .2rem .5rem; font-size: .88rem; font-weight: 650; }
    .pe-foundation-axiom a { text-decoration: none !important; }
    .pe-dependency-coverage { font-size: .78rem; opacity: .75; margin: .4rem 0 1rem; }
    .pe-dependency-panel h3 { font-size: .9rem; font-weight: 650; margin: 1rem 0 .45rem; }
    .pe-dependency-tree, .pe-dependency-tree ul, .pe-dependency-problems ul {
      margin: 0; padding: 0 0 0 1.05rem; list-style: none; }
    .pe-dependency-tree { padding-left: .25rem; }
    .pe-dependency-tree li { margin: .45rem 0; line-height: 1.45; }
    .pe-dependency-tree ul { margin-left: .35rem; border-left: 1px solid #8885; }
    .pe-dependency-tree summary { cursor: pointer; }
    .pe-dependency-tree details > summary::marker { color: #888; }
    .pe-dependency-tree a, .pe-dependency-problems a { color: inherit;
      text-decoration: underline; text-underline-offset: 2px; }
    .pe-dependency-axiom { font-weight: 550; }
    .pe-dependency-warning { font-size: .81rem; opacity: .8; }
    .pe-dependency-problems { margin: .8rem 0; font-size: .8rem; opacity: .9; }
    .pe-dependency-problems summary { cursor: pointer; }

    html.proof-explorer-mode body { overflow: hidden !important; }
    @media (max-width: 760px) {
      .pe-workspace { flex-direction: column; }
      .pe-dependency-panel { width: 100%; max-width: none; min-width: 0;
        max-height: 39vh; border-left: 0; border-top: 1px solid #888; }
    }
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
    // A screen-space SVG layer draws the horizontal inference bars after
    // projecting their positions from the zoomable proof. Its strokes never
    // inherit the stage's CSS scale, so they remain one screen pixel wide.
    const svgNS = 'http://www.w3.org/2000/svg';
    const lineLayer = document.createElementNS(svgNS, 'svg');
    lineLayer.classList.add('pe-inference-lines');
    lineLayer.setAttribute('aria-hidden', 'true');
    const solidLines = document.createElementNS(svgNS, 'path');
    const dashedLines = document.createElementNS(svgNS, 'path');
    dashedLines.setAttribute('stroke-dasharray', '4 3');
    lineLayer.append(solidLines, dashedLines);
    viewport.append(lineLayer);
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
    let lineGeometry = [];
    // Coordinates in lineGeometry are local to the *untransformed* stage.
    // Converting them to viewport coordinates on every zoom/pan avoids CSS
    // border rasterization and keeps solid/dashed strokes pixel-crisp.
    const paintLines = () => {
      const dpr = window.devicePixelRatio || 1;
      const physicalWidth = Math.max(1, Math.round(dpr));
      const lineWidth = physicalWidth / dpr;
      solidLines.setAttribute('stroke-width', String(lineWidth));
      dashedLines.setAttribute('stroke-width', String(lineWidth));
      const odd = physicalWidth % 2 === 1;
      const alignY = value => (Math.round(value * dpr - (odd ? .5 : 0)) + (odd ? .5 : 0)) / dpr;
      const solid = [], dashed = [];
      const width = viewport.clientWidth, height = viewport.clientHeight;
      for (const line of lineGeometry) {
        const left = x + line.left * scale;
        const right = x + line.right * scale;
        const screenY = y + line.y * scale;
        if (right < 0 || left > width || screenY < -2 || screenY > height + 2) continue;
        const yy = alignY(screenY);
        const xx1 = Math.round(left * dpr) / dpr;
        // A very short line can round to zero pixels at extreme zoom;
        // give every nonempty, onscreen inference at least one physical pixel.
        const xx2 = Math.max(Math.round(right * dpr) / dpr, xx1 + 1 / dpr);
        (line.dashed ? dashed : solid).push(`M${xx1} ${yy}H${xx2}`);
      }
      solidLines.setAttribute('d', solid.join(' '));
      dashedLines.setAttribute('d', dashed.join(' '));
    };
    const paint = () => {
      stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      paintLines();
    };
    // Called after a proof is redrawn and its visible inference-line lengths
    // have been trimmed. Only positions are measured; nothing is reflowed.
    stage.proofExplorerSyncLines = () => {
      const stageRect = stage.getBoundingClientRect();
      const displayedScale = stage.offsetWidth ? stageRect.width / stage.offsetWidth : scale;
      const result = [];
      if (!Number.isFinite(displayedScale) || displayedScale <= 0) return;
      for (const bar of stage.querySelectorAll('.pe-tree .pe-bar')) {
        if (bar.classList.contains('pe-none')) continue;
        const row = bar.closest('.pe-rule-row');
        if (!row) continue;
        const left = Number.parseFloat(bar.style.getPropertyValue('--pe-line-left'));
        const length = Number.parseFloat(bar.style.getPropertyValue('--pe-line-width'));
        if (!Number.isFinite(left) || !Number.isFinite(length) || length <= 0) continue;
        const rowRect = row.getBoundingClientRect();
        const rowLeft = (rowRect.left - stageRect.left) / displayedScale;
        const rowY = (rowRect.top + rowRect.height / 2 - stageRect.top) / displayedScale;
        result.push({ left: rowLeft + left, right: rowLeft + left + length,
                      y: rowY, dashed: bar.classList.contains('pe-dashed') });
      }
      lineGeometry = result;
      paintLines();
    };
    window.addEventListener('resize', paintLines);
    stage.proofExplorerPanBy = (dx, dy) => {
      x += dx;
      y += dy;
      paint();
    };
    // Expansion can alter the content width dramatically.  If the proof fits
    // at the current zoom, center it in the unused viewport space.  Otherwise
    // keep the user's current pan/zoom rather than unexpectedly zooming out.
    stage.proofExplorerCenterIfFits = () => {
      const proof = stage.querySelector('.pe-tree');
      if (!proof) return;
      const view = viewport.getBoundingClientRect();
      const bounds = proof.getBoundingClientRect();
      if (bounds.width < view.width - 40) {
        x += (view.left + view.width / 2) - (bounds.left + bounds.right) / 2;
      }
      if (bounds.height < view.height - 40) {
        y += (view.top + view.height / 2) - (bounds.top + bounds.bottom) / 2;
      }
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



/* Proof Explorer 1.1 — unique existence and proposition forwarding.
   REPLACES the complete 1.0 expansion add-on (the final IIFE).
   Keep viewer 0.1, full-proof substitution 0.2 and proofExplorerPanBy.
   Registry version 7 is generated by scripts/build_proof_registry.py.
   This explores authored proofs; it does not verify logical correctness. */
(() => {
  'use strict';
  if (!new URLSearchParams(location.search).has('proof-explorer')) return;

  const LINK_PREFIX = '#proof-expand-rule-';
  const PROP_LINK_PREFIX = '#proof-expand-prop-';
  const style = document.createElement('style');
  style.textContent = `
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"],
    .proof-explorer-stage svg a[href^="${PROP_LINK_PREFIX}"] { cursor: zoom-in; }
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"]:hover,
    .proof-explorer-stage svg a[href^="${PROP_LINK_PREFIX}"]:hover { opacity: .62; }
    .proof-explorer-expansion-note { font: inherit; font-size: .85rem; opacity: .85; }
    .proof-explorer-provenance { font: inherit; font-size: .85rem; margin-left: .5rem; }
    .proof-explorer-provenance a { text-decoration: underline; }
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
  // Restricted quantifiers are indivisible control tokens. In particular,
  // the S in \\forall_S and \\exists_S is NOT a substitutable variable.
  // Accept the literal source spelling and Lwarp's escaped-underscore form.
  const TOKEN = /\\(?:forall|exists)(?:_S|\s*\\_S)|\\[A-Za-z@]+|\\.|[A-Za-z](?:_\{?[0-9]+\}?)?|[0-9]+|\s+|[^\s]/g;
  const SIMPLE_VAR = /^[A-Za-z](?:_\{?[0-9]+\}?)?$/;
  // Quantifier binders may also use control-word display names, e.g. \\xi.
  const BINDER_VAR = /^(?:[A-Za-z]|\\[A-Za-z]+)(?:_\{?[0-9]+\}?)?$/;
  function mathTokens(source) {
    const s = canonicalMathSource(source.trim()
      .replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '')
      .replace(/^\$\s*/, '').replace(/\s*\$$/, ''));
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

  // Extract quantifier binders from FORMULAS, rather than scanning arbitrary
  // TeX strings. Fail closed if a replacement could become captured by a
  // binder already present in the schematic formula. This is deliberately
  // conservative: unsupported alpha-conversion must not change a theorem.
  function quantifiedVariables(formula) {
    const tokens = mathTokens(formula);
    const binders = new Set();
    for (let i = 0; i < tokens.length; ++i) {
      if (!['\\forall', '\\exists', '\\forall_S', '\\exists_S', '\\Unique'].includes(tokens[i])) continue;
      let j = i + 1;
      if (tokens[i] === '\\exists' && tokens[j] === '!') j++;
      if (BINDER_VAR.test(tokens[j] || '')) binders.add(tokens[j]);
    }
    return binders;
  }

  function substituteFormula(formula, substitutions) {
    const binders = quantifiedVariables(formula);
    const variables = new Set(mathTokens(formula).filter(token => BINDER_VAR.test(token)));
    // Renaming a binder is legal only when no *other* variable in the
    // formula would acquire that binder's new name. This also handles
    // simultaneous replacements (A -> B, B -> C) without false alarms.
    for (const binder of binders) {
      const after = Object.prototype.hasOwnProperty.call(substitutions, binder)
        ? substitutions[binder] : binder;
      for (const variable of variables) {
        if (variable === binder) continue;
        const mapped = Object.prototype.hasOwnProperty.call(substitutions, variable)
          ? substitutions[variable] : variable;
        if (mapped === after) {
          throw new Error(`Unsafe proof substitution: ${variable} would be captured by bound ${after}`);
        }
      }
    }
    return formula.replace(TOKEN, token =>
      Object.prototype.hasOwnProperty.call(substitutions, token)
        ? substitutions[token] : token
    );
  }

  // Locate inference nodes by executing the bussproofs stack operations.
  // For each subtree, retain the actual TeX source span: this is what must be
  // grafted into the defining derivation, not just the premise's last formula.
  // Labels are metadata, not formulas. Math-mode delimiters are formatting:
  // RightLabel{3}, RightLabel{\(3\)}, RightLabel{$3$}, and their schematic
  // equivalents have the same identity. Record source offsets so renumbering
  // changes ONLY the assumption tokens, preserving the authored TeX.
  function labelProjection(source) {
    const chars = [], offsets = [];
    const markup = /\\\(|\\\)|\\\[|\\\]|\$|\s+/g;
    let start = 0, match;
    while ((match = markup.exec(source))) {
      for (let i = start; i < match.index; ++i) {
        chars.push(source[i]); offsets.push(i);
      }
      start = markup.lastIndex;
    }
    for (let i = start; i < source.length; ++i) {
      chars.push(source[i]); offsets.push(i);
    }
    return {key: chars.join(''), offsets};
  }

  function normalizeRuleLabel(text) {
    return canonicalMathSource(labelProjection(text || '').key);
  }

  function labelNumbers(label) {
    const compact = normalizeRuleLabel(label);
    if (/^[1-9]\d*$/.test(compact)) return [compact];
    const match = compact.match(/,([1-9]\d*(?:,[1-9]\d*)*)$/);
    return match ? match[1].split(',') : [];
  }

  function rewrittenLabelNumbers(label, renaming) {
    const {key, offsets} = labelProjection(label);
    let spans = [];
    if (/^[1-9]\d*$/.test(key)) {
      spans = [{start: 0, end: key.length, token: key}];
    } else {
      const match = /,([1-9]\d*(?:,[1-9]\d*)*)$/.exec(key);
      if (match) {
        const start = key.length - match[1].length;
        const re = /[1-9]\d*/g;
        let part;
        while ((part = re.exec(match[1]))) {
          spans.push({start: start + part.index,
                      end: start + part.index + part[0].length,
                      token: part[0]});
        }
      }
    }
    for (const span of spans.reverse()) {
      const replacement = renaming.get(span.token);
      if (replacement === undefined || replacement === span.token) continue;
      const from = offsets[span.start], to = offsets[span.end - 1] + 1;
      label = label.slice(0, from) + replacement + label.slice(to);
    }
    return label;
  }

  // Restricted-quantifier rules use a FORMULA metavariable. The ordinary
  // single-symbol unifier cannot recognize these. We parse the particular
  // quantified formula instead, checking that its matrix is instantiated
  // consistently with the actual premise or subderivation.
  function bareMath(formula) {
    let s = formula.trim();
    if (s.startsWith('\\(') && s.endsWith('\\)')) s = s.slice(2, -2).trim();
    return s;
  }

  function balancedOuterParen(text) {
    if (!text.startsWith('(') || !text.endsWith(')')) return false;
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')' && --depth === 0 && i !== text.length - 1) return false;
    }
    return depth === 0;
  }

  function formulaKey(formula) {
    let s = bareMath(formula);
    while (balancedOuterParen(s)) s = s.slice(1, -1).trim();
    return mathTokens(s).filter(t => !['\\,', '\\;', '\\:', '\\!', '\\quad', '\\qquad'].includes(t)).join('');
  }

  function restrictedQuantifier(formula, expected) {
    let s = canonicalMathSource(bareMath(formula));
    const prefix = '\\' + expected + '_S';
    if (!s.startsWith(prefix)) return null;
    s = s.slice(prefix.length);
    const match = s.match(/^\s*(\\[A-Za-z]+|[A-Za-z](?:_\{?[0-9]+\}?)?)/);
    if (!match) return null;
    const binder = match[1];
    if (!SIMPLE_VAR.test(binder) && !/^\\[A-Za-z]+$/.test(binder)) return null;
    s = s.slice(match[0].length).replace(/^(?:\s|\\[,;:!])+/, '').trim();
    return s ? {binder, body: s} : null;
  }

  // Lwarp / MathJax can turn the authored restricted quantifier \forall_S
  // into \forall \_S (likewise for \exists_S). Normalize both spellings
  // while MATCHING formulas and labels; do not change the rendered source.
  // The preamble also defines \Unique as \mathop{\exists^{\leq 1}}.
  // Centralize these source-equivalent math spellings in ONE normalizer,
  // rather than duplicating ad-hoc fixes across specialized rule matchers.
  function canonicalMathSource(source) {
    return source
      .replace(/\\(forall|exists)\s*\\?_S\b/g, (_, quantifier) => `\\${quantifier}_S`)
      .replace(
        /\\exists\s*\^\s*(?:\{\s*\\(?:leqslant|leq|le)\s*1\s*\}|\\(?:leqslant|leq|le)\s*1)/g,
        '\\Unique'
      )
      .replace(/\\mathop\s*\{\s*\\Unique\s*\}/g, '\\Unique');
  }

  // Unique-existence notation is intentionally unrestricted here.
  // The quantifier parses a complete matrix, rather than a single symbol.
  // All three forms must have the same binder and matrix (no alpha conversion).
  // Parse the quantifier's prefix, but preserve the matrix as original TeX.
  // Token-joining a formula without separators is unsafe: "\\in A" would
  // become the nonexistent command "\\inA", and "\\forall_S x" can become
  // "\\forall_Sx".  Normalization is only for recognition, not re-rendering.
  function uniqueQuantifier(formula, expected) {
    let source = canonicalMathSource(bareMath(formula));
    const prefix = expected === 'exact' ? /^\\exists\s*!/ :
      expected === 'atmostone' ? /^\\Unique\b/ : /^\\exists\b(?!\s*!)/;
    const head = source.match(prefix);
    if (!head) return null;
    source = source.slice(head[0].length)
      .replace(/^(?:\s|\\[,;:!])+/, '');
    const bound = source.match(/^([A-Za-z](?:_\{?[0-9]+\}?)?)/);
    if (!bound || !SIMPLE_VAR.test(bound[1])) return null;
    const binder = bound[1];
    const body = source.slice(bound[0].length)
      .replace(/^(?:\s|\\[,;:!])+/, '').trim();
    return body ? {binder, body} : null;
  }

  function identicalUniqueFormula(a, b) {
    return a && b && a.binder === b.binder &&
      formulaKey(a.body) === formulaKey(b.body);
  }

  function matchUniqueApplication(rule, branches, conclusion) {
    if (rule.variant === 'intro') {
      const q = uniqueQuantifier(conclusion, 'exact');
      if (!q || branches.length !== 2) return null;
      for (const order of [[0, 1], [1, 0]]) {
        const exists = uniqueQuantifier(branches[order[0]].formula, 'exists');
        const atmost = uniqueQuantifier(branches[order[1]].formula, 'atmostone');
        if (identicalUniqueFormula(q, exists) && identicalUniqueFormula(q, atmost)) {
          return {bindings: {}, order, unique: q};
        }
      }
      return null;
    }
    if (branches.length !== 1) return null;
    const q = uniqueQuantifier(branches[0].formula, 'exact');
    const target = uniqueQuantifier(conclusion,
      rule.variant === 'existence' ? 'exists' : 'atmostone');
    return identicalUniqueFormula(q, target)
      ? {bindings: {}, order: [0], unique: q} : null;
  }

  // At-most-one introduction: a complete subderivation of a=b from two
  // independently labelled assumptions phi(a), phi(b) is sufficient to
  // derive \Unique x phi(x). Both labels are discharged in the expansion.
  // This is a specialized FORMULA-metavariable rule, not ordinary unification.
  function uniquenessIntroTokens(formula) {
    const invisible = new Set([
      '\\bigl', '\\bigr', '\\Bigl', '\\Bigr', '\\left', '\\right',
      '\\,', '\\;', '\\:', '\\!', '\\quad', '\\qquad'
    ]);
    return forallStarTokens(canonicalMathSource(formula)).filter(t => !invisible.has(t));
  }

  function uniquenessIntroKey(formula) {
    return forallStarUnwrapTokens(uniquenessIntroTokens(formula)).join('');
  }

  function uniquenessIntroFresh(occupied) {
    for (const candidate of ['y', 'z', 'u', 'v', 'w', 't']) {
      if (!occupied.has(candidate)) {
        occupied.add(candidate);
        return candidate;
      }
    }
    for (let index = 0; ; index++) {
      const candidate = `z_{${index}}`;
      if (!occupied.has(forallStarVariableKey(candidate))) {
        occupied.add(forallStarVariableKey(candidate));
        return candidate;
      }
    }
  }

  function matchAtMostIntroduction(branch, conclusion, premiseSource, tags) {
    if (!tags || tags.length !== 2 || tags[0] === tags[1] ||
        /\\(?:vdots|cdots|ldots)\b/.test(premiseSource)) return null;
    const equality = uniquenessIntroTokens(branch.formula);
    if (equality.length !== 3 || equality[1] !== '=' ||
        !FORALL_STAR_VAR.test(equality[0]) ||
        !FORALL_STAR_VAR.test(equality[2])) return null;
    const [a, , b] = equality;
    if (a === b) return null;
    const quantified = uniquenessIntroTokens(conclusion);
    if (quantified[0] !== '\\Unique' || !FORALL_STAR_VAR.test(quantified[1] || '')) return null;
    const x = quantified[1];
    const body = quantified.slice(2);
    if (!body.length || a === x || b === x) return null;

    // The witnesses must be genuinely fresh for the quantified matrix;
    // reject possible capture or shadowing rather than guessing at binding.
    const inner = forallStarInnerBinders(body);
    if (!inner || inner.has(x) || inner.has(a) || inner.has(b) ||
        body.includes(a) || body.includes(b)) return null;
    const phi = value => forallStarJoin(body.map(token => token === x ? value : token));
    const expected = [phi(a), phi(b)];

    // Inspect DEPENDENCIES, not all historical assumption occurrences:
    // discharged temporary assumptions must not block this rule.
    const dependencies = forallStarDependencies(premiseSource);
    if (!dependencies) return null;
    const found = [0, 0];
    for (const leaf of dependencies) {
      const position = tags.indexOf(leaf.tag);
      if (position >= 0) {
        if (uniquenessIntroKey(leaf.formula) !== uniquenessIntroKey(expected[position])) return null;
        found[position]++;
      } else if (uniquenessIntroTokens(leaf.formula).some(t => t === a || t === b)) {
        return null;
      }
    }
    if (found.some(n => n === 0)) return null;

    // Do not allow an inner inference to have already discharged either
    // of the two chosen assumption classes.
    const labels = /\\(?:RightLabel|RL)\b/g;
    let label;
    while ((label = labels.exec(premiseSource))) {
      const arg = braced(premiseSource, labels.lastIndex);
      if (!arg) return null;
      labels.lastIndex = arg.end;
      const normalized = normalizeRuleLabel(arg.content);
      if (normalized.includes(',') && tags.some(tag => labelNumbers(arg.content).includes(tag))) return null;
    }
    return {a, b, x, body, tags, phi};
  }

  // Expand at-most-one introduction directly from its existing proof.
  // The premise tree contains open assumptions phi(a)^n and phi(b)^m.
  // Ordinary implication introduction discharges m, then n; two ordinary
  // universal introductions and the defining abbreviation complete the tree.
  // No conjunction assumption or replacement of premise leaves is necessary.
  function expandAtMostIntroduction(source, hit) {
    const info = hit.uniquenessIntro;
    const phi = info.phi;
    const [n, m] = info.tags;
    const a = info.a;
    const b = info.b;
    let replacement = hit.premiseSources[0];

    // Choose fresh *bound* variables, avoiding capture of any variable
    // already occurring in the actual source proof.
    const occupied = new Set([
      ...uniquenessIntroTokens(source), ...uniquenessIntroTokens(hit.originalConclusion)
    ].filter(token => FORALL_STAR_VAR.test(token)).map(forallStarVariableKey));
    const y = uniquenessIntroFresh(occupied);
    const z = uniquenessIntroFresh(occupied);
    const conditional = (u, v) => `(${phi(u)})\\to((${phi(v)})\\to ${u}=${v})`;

    replacement += `\n\\RightLabel{\\(\\to\\)-I, ${m}}\n` +
      `\\UnaryInfC{\\((${phi(b)})\\to ${a}=${b}\\)}\n` +
      `\\RightLabel{\\(\\to\\)-I, ${n}}\n` +
      `\\UnaryInfC{\\(${conditional(a, b)}\\)}\n` +
      `\\RightLabel{\\(\\forall\\)-I}\n` +
      `\\UnaryInfC{\\(\\forall ${z}\\,(${conditional(a, z)})\\)}\n` +
      `\\RightLabel{\\(\\forall\\)-I}\n` +
      `\\UnaryInfC{\\(\\forall ${y}\\forall ${z}\\,(${conditional(y, z)})\\)}\n` +
      `\\RightLabel{${hit.rule.definitionLabel}}\n\\dashedLine\n` +
      `\\UnaryInfC{${hit.originalConclusion}}`;
    return source.slice(0, hit.start) + replacement + source.slice(hit.end);
  }

  function uniqueTemplate(hit) {
    const {binder: x, body} = hit.unique;
    const exists = `\\exists ${x}\\,${body}`;
    const atmost = `\\Unique ${x}\\,${body}`;
    const conjunction = `\\((${exists})\\land ${atmost}\\)`;
    if (hit.rule.variant === 'intro') {
      return `@@PE_PREMISE_0@@\n@@PE_PREMISE_1@@\n` +
        `\\RightLabel{\\(\\land\\)-I}\n\\BinaryInfC{${conjunction}}\n` +
        `\\RightLabel{${hit.rule.definitionLabel}}\n\\dashedLine\n` +
        `\\UnaryInfC{${hit.originalConclusion}}`;
    }
    return `@@PE_PREMISE_0@@\n` +
      `\\RightLabel{${hit.rule.definitionLabel}}\n\\dashedLine\n` +
      `\\UnaryInfC{${conjunction}}\n` +
      `\\RightLabel{\\(\\land\\)-E}\n` +
      `\\UnaryInfC{${hit.originalConclusion}}`;
  }

  function setVariable(formula) {
    const match = bareMath(formula).match(/^\\Set\s*\(\s*(\\[A-Za-z]+|[A-Za-z](?:_\{?[0-9]+\}?)?)\s*\)$/);
    return match ? match[1] : null;
  }

  function appearsVariable(formula, variable) {
    return mathTokens(formula).includes(variable);
  }

  // This is deliberately conservative: we do not perform arbitrary capture-
  // avoiding substitution under nested binders. If a potentially interfering
  // binder occurs, the instance simply cannot be expanded by this version.
  function instantiatedMatrix(body, binder, witness) {
    const quant = /\\(?:forall|exists)(?:_S)?\s*(\\[A-Za-z]+|[A-Za-z](?:_\{?[0-9]+\}?)?)/g;
    let match;
    while ((match = quant.exec(body))) {
      if (match[1] === binder || match[1] === witness) return null;
    }
    try {
      return substituteFormula(body, {[binder]: witness});
    } catch {
      return null;
    }
  }

  function restrictedLabel(rule, actual) {
    const s = normalizeRuleLabel(actual);
    const quantifier = rule.mode.startsWith('forall') ? '\\forall_S' : '\\exists_S';
    const op = rule.mode.endsWith('-i') ? 'I' : 'E';
    const head = `${quantifier}-${op}`;
    if (rule.mode === 'forall-e' || rule.mode === 'exists-i') {
      return s === head ? {tag: null} : null;
    }
    if (!s.startsWith(head + ',')) return null;
    const tail = s.slice(head.length + 1);
    if (rule.mode === 'forall-i') {
      return /^[1-9]\d*$/.test(tail) ? {tag: tail} : null;
    }
    const match = tail.match(/^([1-9]\d*),([1-9]\d*)$/);
    return match && match[1] !== match[2]
      ? {tag: null, n: match[1], m: match[2]} : null;
  }

  function tagIsDischargedWithin(source, tag) {
    const labels = /\\(?:RightLabel|RL)\b/g;
    let match;
    while ((match = labels.exec(source))) {
      const arg = braced(source, labels.lastIndex);
      if (!arg) return true;
      labels.lastIndex = arg.end;
      if (normalizeRuleLabel(arg.content).includes(',') && labelNumbers(arg.content).includes(tag)) {
        return true;
      }
    }
    return false;
  }

  function matchRestrictedApplication(rule, branches, conclusion, labelInfo, source) {
    const mode = rule.mode;
    const arity = mode === 'forall-i' ? 1 : 2;
    if (branches.length !== arity) return null;
    const orders = arity === 1 ? [[0]] : [[0, 1], [1, 0]];
    const check = (tag, leaves, expected, witness) => {
      if (!leaves?.some(leaf => leaf.tag === tag)) return false;
      return leaves.every(leaf => {
        if (leaf.tag === tag) return formulaKey(leaf.formula) === formulaKey(expected);
        return !appearsVariable(leaf.formula, witness);
      });
    };
    for (const order of orders) {
      const first = branches[order[0]], second = branches[order[1]];
      if (mode === 'forall-e') {
        const q = restrictedQuantifier(first.formula, 'forall');
        const witness = second && setVariable(second.formula);
        if (!q || !witness) continue;
        const instance = instantiatedMatrix(q.body, q.binder, witness);
        if (instance === null || formulaKey(instance) !== formulaKey(conclusion)) continue;
        return {bindings: {}, order, restricted: {q, witness, instance}};
      }
      if (mode === 'exists-i') {
        const q = restrictedQuantifier(conclusion, 'exists');
        const witness = setVariable(first.formula);
        if (!q || !witness || !second) continue;
        const instance = instantiatedMatrix(q.body, q.binder, witness);
        if (instance === null || formulaKey(instance) !== formulaKey(second.formula)) continue;
        return {bindings: {}, order, restricted: {q, witness, instance}};
      }
      if (mode === 'forall-i') {
        const q = restrictedQuantifier(conclusion, 'forall');
        if (!q || !labelInfo.tag) continue;
        const branchSource = source.slice(first.start, first.end);
        if (/\\(?:vdots|cdots|ldots)\b/.test(branchSource) ||
            tagIsDischargedWithin(branchSource, labelInfo.tag)) continue;
        const leaves = openAssumptions(branchSource);
        const possible = leaves?.filter(leaf => leaf.tag === labelInfo.tag).map(leaf => setVariable(leaf.formula));
        const witness = possible?.[0];
        if (!witness || possible.some(item => item !== witness) ||
            appearsVariable(q.body, witness)) continue;
        const instance = instantiatedMatrix(q.body, q.binder, witness);
        if (instance === null || formulaKey(instance) !== formulaKey(first.formula) ||
            !check(labelInfo.tag, leaves, `\\(\\Set(${witness})\\)`, witness)) continue;
        return {bindings: {}, order, restricted: {q, witness, instance, tag: labelInfo.tag}};
      }
      if (mode === 'exists-e') {
        const q = restrictedQuantifier(first.formula, 'exists');
        if (!q || !second || !labelInfo.n || !labelInfo.m ||
            formulaKey(second.formula) !== formulaKey(conclusion)) continue;
        const majorSource = source.slice(first.start, first.end);
        const minorSource = source.slice(second.start, second.end);
        if (/\\(?:vdots|cdots|ldots)\b/.test(minorSource) ||
            tagIsDischargedWithin(minorSource, labelInfo.n) ||
            tagIsDischargedWithin(minorSource, labelInfo.m)) continue;
        const minorLeaves = openAssumptions(minorSource);
        const majorLeaves = openAssumptions(majorSource);
        const taggedSet = minorLeaves?.filter(leaf => leaf.tag === labelInfo.n);
        const witnesses = taggedSet?.map(leaf => setVariable(leaf.formula));
        const witness = witnesses?.[0];
        if (!witness || !witnesses.length || witnesses.some(v => v !== witness) ||
            appearsVariable(q.body, witness) || appearsVariable(conclusion, witness)) continue;
        const instance = instantiatedMatrix(q.body, q.binder, witness);
        if (instance === null || !minorLeaves || !minorLeaves.some(l => l.tag === labelInfo.m) ||
            !minorLeaves.every(l => l.tag === labelInfo.n ?
              formulaKey(l.formula) === formulaKey(`\\(\\Set(${witness})\\)`) :
              l.tag === labelInfo.m ? formulaKey(l.formula) === formulaKey(instance) :
              !appearsVariable(l.formula, witness)) ||
            !majorLeaves || majorLeaves.some(leaf => appearsVariable(leaf.formula, witness))) continue;
        // Both discharged tags must occur, and every leaf bearing one must
        // represent its specified assumption (never an unrelated formula).
        return {bindings: {}, order, restricted: {q, witness, instance,
          n: labelInfo.n, m: labelInfo.m}};
      }
    }
    return null;
  }

  function replaceRestrictedAssumptions(minor, data) {
    const cmd = /\\(AxiomC|RightLabel|RL|UnaryInfC)\b/g;
    const calls = [];
    let match;
    while ((match = cmd.exec(minor))) {
      const arg = braced(minor, cmd.lastIndex);
      if (!arg) throw new Error('Malformed assumption line');
      calls.push({name: match[1], arg: arg.content, start: match.index, end: arg.end});
      cmd.lastIndex = arg.end;
    }
    const conjunct = `\\(\\Set(${data.witness})\\land (${stripMatrixParens(data.instance)})\\)`;
    const changes = [];
    const counts = {[data.n]: 0, [data.m]: 0};
    for (let i = 0; i + 2 < calls.length; i++) {
      const a = calls[i], b = calls[i+1], c = calls[i+2];
      if (a.name !== 'AxiomC' || formulaKey(a.arg) ||
          !['RightLabel','RL'].includes(b.name) || c.name !== 'UnaryInfC') continue;
      const tag = bareMath(b.arg).trim();
      if (tag !== data.n && tag !== data.m) continue;
      const expected = tag === data.n ? `\\Set(${data.witness})` : data.instance;
      if (formulaKey(c.arg) !== formulaKey(expected)) throw new Error('Incorrect discharged minor assumption');
      counts[tag]++;
      changes.push([a.start, c.end,
        `\\AxiomC{}\n\\RightLabel{@@PE_LOCAL_k@@}\n\\UnaryInfC{${conjunct}}\n` +
        `\\RightLabel{\\(\\land\\)-E}\n\\UnaryInfC{${c.arg}}`]);
      i += 2;
    }
    if (!counts[data.n] || !counts[data.m]) throw new Error('Missing restricted existential assumptions');
    for (const [start, end, value] of changes.reverse()) {
      minor = minor.slice(0, start) + value + minor.slice(end);
    }
    return minor;
  }

  function stripMatrixParens(source) {
    let s = source.trim();
    while (balancedOuterParen(s)) s = s.slice(1, -1).trim();
    return s;
  }

  function restrictedTemplate(hit) {
    const {q, witness, instance} = hit.restricted;
    const matrix = `(${stripMatrixParens(q.body)})`;
    const instanceMatrix = `(${stripMatrixParens(instance)})`;
    const universal = `\\(\\forall ${q.binder}(\\Set(${q.binder})\\to ${matrix})\\)`;
    const existential = `\\(\\exists ${q.binder}(\\Set(${q.binder})\\land ${matrix})\\)`;
    const instanceImp = `\\(\\Set(${witness})\\to ${instanceMatrix}\\)`;
    const instanceConj = `\\(\\Set(${witness})\\land ${instanceMatrix}\\)`;
    const final = hit.originalConclusion;
    switch (hit.rule.mode) {
      case 'forall-i':
        return `@@PE_PREMISE_0@@\n\\RightLabel{\\(\\to\\)-I, ${hit.restricted.tag}}\n` +
          `\\UnaryInfC{${instanceImp}}\n\\RightLabel{\\(\\forall\\)-I}\n` +
          `\\UnaryInfC{${universal}}\n\\RightLabel{Def.}\n\\dashedLine\n\\UnaryInfC{${final}}`;
      case 'forall-e':
        return `@@PE_PREMISE_0@@\n\\RightLabel{Def.}\n\\dashedLine\n\\UnaryInfC{${universal}}\n` +
          `\\RightLabel{\\(\\forall\\)-E}\n\\UnaryInfC{${instanceImp}}\n` +
          `@@PE_PREMISE_1@@\n\\RightLabel{\\(\\to\\)-E}\n\\BinaryInfC{${final}}`;
      case 'exists-i':
        return `@@PE_PREMISE_0@@\n@@PE_PREMISE_1@@\n\\RightLabel{\\(\\land\\)-I}\n` +
          `\\BinaryInfC{${instanceConj}}\n\\RightLabel{\\(\\exists\\)-I}\n` +
          `\\UnaryInfC{${existential}}\n\\RightLabel{Def.}\n\\dashedLine\n\\UnaryInfC{${final}}`;
      case 'exists-e':
        return `@@PE_PREMISE_0@@\n\\RightLabel{Def.}\n\\dashedLine\n\\UnaryInfC{${existential}}\n` +
          `@@PE_PREMISE_1@@\n\\RightLabel{\\(\\exists\\)-E, @@PE_LOCAL_k@@}\n\\BinaryInfC{${final}}`;
      default: throw new Error('Unsupported restricted quantifier rule');
    }
  }

  // R* is a DISPLAY CONVENTION, not a derived rule in proof-rules.json.
  // In particular, forall-I* has a variable-length, formula-valued matrix.
  // It must reconstruct ordinary introductions rather than use the registry's
  // single-symbol schematic unifier. We deliberately fail closed on syntax
  // whose substitutions or assumption dependencies we cannot establish.
  const FORALL_STAR_TOKEN = /\\[A-Za-z@]+(?:_\{?[A-Za-z0-9]+\}?)?|\\.|[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?|[0-9]+|\s+|[^\s]/g;
  const FORALL_STAR_SPACE = new Set(['\\,', '\\;', '\\:', '\\!', '\\quad', '\\qquad']);
  const FORALL_STAR_VAR = /^(?:[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?|\\[A-Za-z]+(?:_\{?[A-Za-z0-9]+\}?)?)$/;

  function forallStarTokens(formula) {
    let s = canonicalMathSource(bareMath(formula));
    while (balancedOuterParen(s)) s = s.slice(1, -1).trim();
    return (s.match(FORALL_STAR_TOKEN) || []).filter(
      token => !/^\s+$/.test(token) && !FORALL_STAR_SPACE.has(token)
    );
  }

  // TeX control words must be separated from following letter tokens.
  // Joining \land + y as \landy would silently change the mathematics.
  function forallStarJoin(tokens) {
    let result = '';
    let previous = '';
    for (const token of tokens) {
      // Both \\forall and \\forall_S must be separated from the following
      // binder letter. Without this, joining makes \\forall_Sx (or \\inA).
      if (/^\\[A-Za-z@]+(?:_\{?[A-Za-z0-9]+\}?)?$/.test(previous) &&
          /^[A-Za-z@]/.test(token)) result += ' ';
      result += token;
      previous = token;
    }
    return result;
  }

  // x_0 and x_{0} are TeX spellings of the same variable.
  function forallStarVariableKey(token) {
    return token.replace(/_\{([A-Za-z0-9]+)\}$/, '_$1');
  }

  function isForallIStarLabel(label) {
    const compact = normalizeRuleLabel(label);
    return /^\\forall-I(?:\^\{(?:\*|\\ast)\}|\^(?:\*|\\ast)|\*)$/.test(compact);
  }

  // Collect dependencies at the root of the premise SUBDERIVATION, rather than
  // treating every historical assumption leaf as undischarged. We recognize
  // the primitive discharge rules used by the manuscript. Unrecognized
  // discharges are not assumed: they can only prevent an expansion.
  function forallStarDependencies(subtree) {
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL)\b/g;
    const arities = {UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
                     QuaternaryInfC: 4, QuinaryInfC: 5};
    const stack = [];
    let pending = null;
    let hit;
    while ((hit = command.exec(subtree))) {
      const arg = braced(subtree, command.lastIndex);
      if (!arg) return null;
      command.lastIndex = arg.end;
      if (hit[1] === 'RightLabel' || hit[1] === 'RL') {
        pending = normalizeRuleLabel(arg.content);
        continue;
      }
      if (hit[1] === 'AxiomC') {
        const empty = !forallStarTokens(arg.content).length;
        stack.push({empty, dependencies: empty ? [] : [{formula: arg.content, tag: null}]});
        pending = null;
        continue;
      }
      const arity = arities[hit[1]];
      if (!arity || stack.length < arity) return null;
      const children = stack.splice(-arity, arity);
      const dependencyLists = children.map(child => child.dependencies);
      if (arity === 1 && children[0].empty) {
        const assumption = pending?.match(/^([1-9][0-9]*)$/);
        dependencyLists[0] = assumption
          ? [{formula: arg.content, tag: assumption[1]}] : [];
      } else if (arity === 1) {
        const discharge = pending?.match(/^(?:\\to-I|\\neg-I|CR|\\forall_S-I),([1-9][0-9]*)$/);
        if (discharge) {
          dependencyLists[0] = dependencyLists[0].filter(leaf => leaf.tag !== discharge[1]);
        }
      } else if (arity === 2) {
        const discharge = pending?.match(/^\\exists-E,([1-9][0-9]*)$/);
        if (discharge) {
          dependencyLists[1] = dependencyLists[1].filter(leaf => leaf.tag !== discharge[1]);
        }
      } else if (arity === 3) {
        const discharge = pending?.match(/^\\lor-E,([1-9][0-9]*),([1-9][0-9]*)$/);
        if (discharge) {
          dependencyLists[1] = dependencyLists[1].filter(leaf => leaf.tag !== discharge[1]);
          dependencyLists[2] = dependencyLists[2].filter(leaf => leaf.tag !== discharge[2]);
        }
      }
      stack.push({empty: false, dependencies: dependencyLists.flat()});
      pending = null;
    }
    return stack.length === 1 ? stack[0].dependencies : null;
  }

  // Quantification normally adds a scope parenthesis around the matrix.
  // Such an outer pair is typographical grouping, not a change of formula.
  function forallStarUnwrapTokens(tokens) {
    let result = tokens.slice();
    while (result[0] === '(' && result[result.length - 1] === ')') {
      let depth = 0;
      let complete = true;
      for (let i = 0; i < result.length; i++) {
        if (result[i] === '(') depth++;
        if (result[i] === ')' && --depth === 0 && i !== result.length - 1) {
          complete = false;
          break;
        }
      }
      if (!complete || depth !== 0) break;
      result = result.slice(1, -1);
    }
    return result;
  }

  // Recognize quantified binders that remain IN the matrix. Generalized
  // variables cannot be shadowed by those binders, and witnesses cannot
  // coincide with them (otherwise substitution may capture variables).
  function forallStarInnerBinders(tokens) {
    const bound = new Set();
    for (let i = 0; i < tokens.length; ++i) {
      if (!['\\forall', '\\exists', '\\forall_S', '\\exists_S', '\\Unique'].includes(tokens[i])) continue;
      let index = i + 1;
      if (tokens[i] === '\\exists' && tokens[index] === '!') index++;
      const binder = tokens[index];
      if (!binder || !FORALL_STAR_VAR.test(binder)) return null;
      bound.add(binder);
    }
    return bound;
  }

  // Return the complete sequence of intermediate conclusions (innermost
  // introduction first), or null unless the primitive-rule side conditions
  // can be established conservatively.
  function matchForallIStar(premiseFormula, finalConclusion, premiseSource) {
    if (/\\(?:vdots|cdots|ldots)\b/.test(premiseSource)) return null;
    const dependencies = forallStarDependencies(premiseSource);
    if (!dependencies) return null;
    const conclusion = forallStarTokens(finalConclusion);
    const premise = forallStarTokens(premiseFormula);
    const prefixes = [];
    let cursor = 0;
    while (conclusion[cursor] === '\\forall' &&
           FORALL_STAR_VAR.test(conclusion[cursor + 1] || '')) {
      const binder = conclusion[cursor + 1];
      if (prefixes.some(x => forallStarVariableKey(x.binder) === forallStarVariableKey(binder))) return null;
      cursor += 2;
      prefixes.push({binder, end: cursor});
    }
    if (!prefixes.length) return null;

    // The final formula can already contain universal quantifiers inherited
    // from the premise. Try every possible number of NEW introductions.
    for (let count = prefixes.length; count >= 1; --count) {
      const binders = prefixes.slice(0, count).map(x => x.binder);
      const matrix = conclusion.slice(prefixes[count - 1].end);
      const matrixView = forallStarUnwrapTokens(matrix);
      if (matrixView.length !== premise.length) continue;
      const inner = forallStarInnerBinders(matrix);
      if (!inner || binders.some(variable => inner.has(variable))) continue;
      const witness = new Map();
      let matches = true;
      for (let i = 0; i < matrixView.length; ++i) {
        const token = matrixView[i];
        if (binders.includes(token)) {
          const actual = premise[i];
          if (!FORALL_STAR_VAR.test(actual)) { matches = false; break; }
          if (witness.has(token) && witness.get(token) !== actual) {
            matches = false; break;
          }
          witness.set(token, actual);
        } else if (token !== premise[i]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // A vacuously introduced binder has no witness occurrence in the
      // premise. Choose an entirely unused metalinguistic witness for the
      // side-condition check; it will not enter any displayed formula.
      const occupied = new Set([
        ...conclusion, ...premise,
        ...dependencies.flatMap(leaf => forallStarTokens(leaf.formula)),
        ...Array.from(witness.values())
      ].map(forallStarVariableKey));
      for (const binder of binders) {
        if (witness.has(binder)) continue;
        let fresh = 'z_{0}';
        let n = 0;
        while (occupied.has(forallStarVariableKey(fresh))) fresh = `z_{${++n}}`;
        witness.set(binder, fresh);
        occupied.add(forallStarVariableKey(fresh));
      }

      const witnesses = binders.map(x => witness.get(x));
      if (new Set(witnesses.map(forallStarVariableKey)).size !== witnesses.length) continue;
      // Stronger than necessary in some shadowing cases, but safe: no
      // eigenvariable may occur anywhere in the final quantified expression.
      if (witnesses.some(eta => conclusion.some(
        token => forallStarVariableKey(token) === forallStarVariableKey(eta)
      ))) continue;
      if (dependencies.some(leaf => witnesses.some(eta => forallStarTokens(leaf.formula).some(
        token => forallStarVariableKey(token) === forallStarVariableKey(eta)
      )))) continue;

      const steps = [];
      for (let i = count - 1; i >= 0; --i) {
        if (i === 0) {
          steps.push(finalConclusion); // retain the source's final TeX exactly
          continue;
        }
        const stillFree = new Map(binders.slice(0, i).map(x => [x, witness.get(x)]));
        const body = forallStarJoin(matrix.map(token => stillFree.get(token) || token));
        const prefix = binders.slice(i).map(variable => `\\forall ${variable}\\,`).join('');
        steps.push(`\\(${prefix}${body}\\)`);
      }
      return {steps, binders, witnesses};
    }
    return null;
  }

  // Match discharge tags by label meaning, not by math-mode typography.
  // Both schematic n and concrete 3 may be authored inside or outside math mode.
  function applicationLabel(rule, actual) {
    if (rule.kind === 'unique' && rule.variant === 'atmost-intro') {
      const compact = normalizeRuleLabel(canonicalMathSource(actual));
      const match = compact.match(/^\\Unique-I,([1-9]\d*),([1-9]\d*)$/);
      return match && match[1] !== match[2]
        ? {tag: null, tags: [match[1], match[2]]} : null;
    }
    if (rule.kind === 'restricted') return restrictedLabel(rule, actual);
    const expected = normalizeRuleLabel(rule.label);
    const observed = normalizeRuleLabel(actual);
    if (rule.kind !== 'subproof') return expected === observed ? {tag: null} : null;
    const schematic = expected.match(/^(.*),([A-Za-z0-9]+)$/);
    const concrete = observed.match(/^(.*),([1-9]\d*)$/);
    if (!schematic || !concrete || schematic[1] !== concrete[1] ||
        schematic[2] !== rule.discharge) return null;
    return {tag: concrete[2]};
  }

  // This narrow open-assumption inspection deliberately fails closed when
  // an eigenvariable occurs in an assumption it cannot establish as discharged.
  // It is NOT a general bound/free-variable analyzer or proof checker.
  function openAssumptions(subtree) {
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL)\b/g;
    const arities = {UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
                     QuaternaryInfC: 4, QuinaryInfC: 5};
    const stack = [];
    let pending = null;
    let hit;
    while ((hit = command.exec(subtree))) {
      const arg = braced(subtree, command.lastIndex);
      if (!arg) return null;
      command.lastIndex = arg.end;
      const name = hit[1];
      if (name === 'RightLabel' || name === 'RL') {
        pending = normalizeRuleLabel(arg.content).replace(/\s+/g, '');
        continue;
      }
      if (name === 'AxiomC') {
        const empty = !mathTokens(arg.content).length;
        stack.push({empty, leaves: empty ? [] : [{formula: arg.content, tag: null}]});
        pending = null;
        continue;
      }
      const arity = arities[name];
      if (!arity || stack.length < arity) return null;
      const children = stack.splice(-arity, arity);
      let leaves = children.flatMap(child => child.leaves);
      if (arity === 1 && children[0].empty) {
        const marker = pending?.match(/^([1-9]\d*)$/);
        leaves = [{formula: arg.content, tag: marker ? marker[1] : null}];
      }
      stack.push({empty: false, leaves});
      pending = null;
    }
    return stack.length === 1 ? stack[0].leaves : null;
  }

  function isSafeSubproof(rule, source, branch, bindings, tag) {
    // A schematic \vdots is not an actual subderivation to graft.
    if (/\\(?:vdots|cdots|ldots)\b/.test(branch)) return false;
    const eigen = bindings[rule.eigen];
    if (!eigen || !SIMPLE_VAR.test(eigen)) return false;
    // Check the eigenvariable condition in the conclusion.
    if (mathTokens(source).includes(eigen)) {
      // 'source' here is the final conclusion, not the whole proof.
      return false;
    }
    const assumptions = openAssumptions(branch);
    if (!assumptions) return false;
    const required = substituteFormula(rule.assumption, bindings);
    const sameFormula = (a, b) => mathTokens(a).join('') === mathTokens(b).join('');
    let discharged = 0;
    for (const leaf of assumptions) {
      if (leaf.tag === tag) {
        if (!sameFormula(leaf.formula, required)) return false;
        discharged++;
      } else if (mathTokens(leaf.formula).includes(eigen)) {
        return false;
      }
    }
    // The selected assumption must really occur in the supplied subproof.
    if (!discharged) return false;
    // Do not reuse a discharge number already consumed inside the branch.
    const rightLabels = /\\(?:RightLabel|RL)\b/g;
    let label;
    while ((label = rightLabels.exec(branch))) {
      const content = braced(branch, rightLabels.lastIndex);
      if (!content) return false;
      rightLabels.lastIndex = content.end;
      if (normalizeRuleLabel(content.content).includes(',') && labelNumbers(content.content).includes(tag)) return false;
    }
    return true;
  }

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
        let rule = null, matchedLabel = null, matched = null;
        if (arity === 1 && isForallIStarLabel(label.value)) {
          const star = matchForallIStar(branches[0].formula, arg.content,
            source.slice(branches[0].start, branches[0].end));
          if (star) {
            rule = {id: 'forall-i-star', kind: 'forall-i-star', fresh: []};
            matchedLabel = {tag: null};
            matched = {bindings: {}, order: [0], forallStar: star};
          }
        }
        for (const candidate of (matched ? [] : rules)) {
          if (candidate.premises.length !== arity) continue;
          const candidateLabel = applicationLabel(candidate, label.value);
          if (!candidateLabel) continue;
          const candidateMatch = candidate.kind === 'restricted'
            ? matchRestrictedApplication(candidate, branches, arg.content,
                candidateLabel, source)
            : candidate.kind === 'unique'
              ? candidate.variant === 'atmost-intro'
                ? (() => {
                    if (arity !== 1) return null;
                    const info = matchAtMostIntroduction(branches[0], arg.content,
                      source.slice(branches[0].start, branches[0].end), candidateLabel.tags);
                    return info ? {bindings: {}, order: [0], uniquenessIntro: info} : null;
                  })()
                : matchUniqueApplication(candidate, branches, arg.content)
              : matchRule(candidate, branches.map(branch => branch.formula), arg.content);
          if (!candidateMatch) continue;
          if (candidate.kind === 'subproof' && !isSafeSubproof(
                candidate, arg.content,
                source.slice(branches[0].start, branches[0].end),
                candidateMatch.bindings, candidateLabel.tag)) continue;
          rule = candidate;
          matchedLabel = candidateLabel;
          matched = candidateMatch;
          break;
        }
        if (matched) {
          hits.push({
            id: hits.length, rule, bindings: matched.bindings,
            premiseOrder: matched.order,
            dischargeTag: matchedLabel.tag,
            restricted: matched.restricted,
            unique: matched.unique,
            uniquenessIntro: matched.uniquenessIntro,
            forallStar: matched.forallStar,
            originalLabel: label.value,
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

  // A proposition reference keeps its existing P-number hyperlink. The
  // *separate* adjacent ⊕ control triggers expansion, not navigation.
  function referencedProposition(label) {
    if (!/^\s*P\s*\\href\s*\{/.test(label)) return null;
    const match = label.match(/\\href\s*\{[^{}#]*#(prop:[^{}]+)\}\s*\{[^{}]+\}/);
    return match ? match[1] : null;
  }

  function findPropositionApplications(source, propositions) {
    const stack = [];
    const hits = [];
    let label = null;
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL)\b/g;
    const arities = {UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
                     QuaternaryInfC: 4, QuinaryInfC: 5};
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
      const arity = arities[name];
      if (!arity || stack.length < arity) {
        label = null;
        continue;
      }
      const branches = stack.splice(-arity, arity);
      const id = label && referencedProposition(label.value);
      const proposition = id && propositions[id];
      if (proposition && arity === 1) {
        for (const variant of proposition.variants) {
          const schematic = {vars: proposition.vars,
            premises: variant.premises, conclusion: variant.conclusion};
          const matched = matchRule(schematic, [branches[0].formula], arg.content);
          if (!matched) continue;
          hits.push({type: 'proposition', proposition, variant,
            rule: {fresh: proposition.fresh}, bindings: matched.bindings,
            premiseSources: [source.slice(branches[0].start, branches[0].end)],
            start: branches[0].start, end: arg.end,
            labelStart: label.start, labelEnd: label.end,
            labelCommand: label.command, originalLabel: label.value,
            originalConclusion: arg.content});
          break;
        }
      }
      stack.push({formula: arg.content, start: branches[0].start, end: arg.end});
      label = null;
    }
    return hits;
  }

  function allApplications(source, rules, propositions) {
    const ruleHits = findApplications(source, rules).map(hit =>
      ({...hit, type: 'rule'}));
    const propositionHits = findPropositionApplications(source, propositions);
    const hits = ruleHits.concat(propositionHits).sort((a, b) =>
      a.labelStart - b.labelStart);
    hits.forEach((hit, index) => { hit.id = index; });
    return hits;
  }

  function markExpandableRules(source, rules, propositions) {
    const hits = allApplications(source, rules, propositions);
    let result = source;
    // Only replace each label, never entire overlapping nested subtrees.
    for (const hit of hits.slice().reverse()) {
      // Math mode is allowed both in the inference symbol and in numbered
      // assumption labels. Never nest an authored label inside \href:
      // MathJax may then parse \( ... \) as invalid nested math and
      // silently omit the link. Keep the label untouched and provide the
      // same separate expansion control used successfully by propositions.
      const prefix = hit.type === 'proposition' ? PROP_LINK_PREFIX : LINK_PREFIX;
      const marker = `\\${hit.labelCommand}{${hit.originalLabel}\\(\\,\\)\\href{${prefix}${hit.id}}{\\(\\oplus\\)}}`;
      result = result.slice(0, hit.labelStart) + marker + result.slice(hit.labelEnd);
    }
    return {tex: result, hits};
  }

  // Read only mathematical formula arguments: inference labels and prose
  // must not affect variable selection. Return ALL variable names, including
  // bound names; those can capture an inserted free variable too.
  function formulaVariablesInProof(tex) {
    const variables = new Set();
    const formulas = /\\(?:AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC)\b/g;
    let command;
    while ((command = formulas.exec(tex))) {
      const arg = braced(tex, formulas.lastIndex);
      if (!arg) throw new Error('Malformed proof formula while selecting fresh variables');
      formulas.lastIndex = arg.end;
      for (const token of mathTokens(arg.content)) {
        if (SIMPLE_VAR.test(token)) variables.add(token);
      }
    }
    return variables;
  }

  function freshSubstitutions(source, hit) {
    const substitutions = Object.assign(Object.create(null), hit.bindings);
    const fresh = hit.rule.fresh || [];
    const template = hit.variant?.template || hit.rule.template || '';
    const used = formulaVariablesInProof(source);
    // Names already occurring in the template, including its quantified
    // binders, are unavailable unless they are exactly the local variables
    // that this expansion itself renames. This prevents \\forall B(B\\in C)
    // from turning into \\forall B(B\\in B) when C is freshened.
    const locals = new Set(fresh);
    for (const variable of formulaVariablesInProof(template)) {
      if (!locals.has(variable)) used.add(variable);
    }
    for (const value of Object.values(substitutions)) used.add(value);

    const lower = ['a', 'b', 'c', 'x', 'y', 'z'];
    const upper = ['A', 'B', 'C', 'X', 'Y', 'Z'];
    for (const local of fresh) {
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

  // Preserve source premise order even when the registered justification
  // finishes with a unary step (e.g. Mutual Inclusion -> Extensionality).
  // Swap the branches at the least common binary ancestor of the two
  // schematic premise slots; leave their entire internal trees unchanged.
  // Must be called before the premise placeholders are grafted.
  function preserveBinaryPremiseOrder(tex) {
    const command = /@@PE_PREMISE_([01])@@|\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC)\b/g;
    const arities = {UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
                     QuaternaryInfC: 4, QuinaryInfC: 5};
    const stack = [];
    let pair = null;
    let match;
    while ((match = command.exec(tex))) {
      if (match[1] !== undefined) {
        stack.push({start: match.index, end: command.lastIndex,
                    slots: new Set([Number(match[1])])});
        continue;
      }
      const name = match[2];
      const arg = braced(tex, command.lastIndex);
      if (!arg) return tex;
      command.lastIndex = arg.end;
      if (name === 'AxiomC') {
        stack.push({start: match.index, end: arg.end, slots: new Set()});
        continue;
      }
      const arity = arities[name];
      if (!arity || stack.length < arity) return tex;
      const children = stack.splice(-arity, arity);
      if (arity === 2 && !pair &&
          children[0].slots.size === 1 && children[0].slots.has(0) &&
          children[1].slots.size === 1 && children[1].slots.has(1)) {
        pair = children;
      }
      const slots = new Set(children.flatMap(child => Array.from(child.slots)));
      stack.push({start: children[0].start, end: arg.end, slots});
    }
    if (!pair || stack.length !== 1) return tex;
    const [left, right] = pair;
    const leftText = tex.slice(left.start, right.start);
    const rightText = tex.slice(right.start, right.end);
    return tex.slice(0, left.start) + rightText + '\n' +
      leftText + tex.slice(right.end);
  }

  // Freshen local assumptions by editing only inference labels.
  function freshenLocalDischarges(source, template, localNumbers) {
    if (!localNumbers?.length) return template;
    const used = new Set();
    const command = /\\(?:RightLabel|RL|LeftLabel|LL)\b/g;
    const harvest = tex => {
      const re = new RegExp(command.source, 'g');
      let match;
      while ((match = re.exec(tex))) {
        const arg = braced(tex, re.lastIndex);
        if (!arg) throw new Error('Malformed assumption label');
        re.lastIndex = arg.end;
        for (const tag of labelNumbers(arg.content)) used.add(Number(tag));
      }
    };
    harvest(source);
    harvest(template);
    let result = template;
    for (const local of localNumbers) {
      const placeholder = `@@PE_LOCAL_${local}@@`;
      if (!result.includes(placeholder)) throw new Error(`Missing local discharge slot ${local}`);
      let candidate = 1;
      while (used.has(candidate)) candidate++;
      used.add(candidate);
      result = result.replaceAll(placeholder, String(candidate));
    }
    if (result.includes('@@PE_LOCAL_')) throw new Error('Unresolved local discharge slot');
    return result;
  }

  // Rename assumption classes in a complete theorem proof, along with ALL
  // of their discharge references, to avoid capture in its surrounding proof.
  function freshenTheoremLabels(source, theorem) {
    const command = /\\(?:RightLabel|RL|LeftLabel|LL)\b/g;
    const scan = (tex, fn) => {
      const re = new RegExp(command.source, 'g');
      let match;
      while ((match = re.exec(tex))) {
        const arg = braced(tex, re.lastIndex);
        if (!arg) throw new Error('Malformed theorem inference label');
        re.lastIndex = arg.end;
        fn(arg);
      }
    };
    const used = new Set();
    scan(source, arg => {
      for (const tag of labelNumbers(arg.content)) used.add(Number(tag));
    });
    const labels = new Set();
    scan(theorem, arg => {
      const label = normalizeRuleLabel(arg.content);
      if (/^[1-9]\d*$/.test(label)) labels.add(label);
    });
    const translation = new Map();
    let candidate = 1;
    for (const label of labels) {
      while (used.has(candidate)) candidate++;
      translation.set(label, String(candidate));
      used.add(candidate++);
    }
    const edits = [];
    scan(theorem, arg => {
      const updated = rewrittenLabelNumbers(arg.content, translation);
      if (updated !== arg.content) edits.push([arg.start + 1, arg.end - 1, updated]);
    });
    let result = theorem;
    for (const [start, end, replacement] of edits.reverse()) {
      result = result.slice(0, start) + replacement + result.slice(end);
    }
    return result;
  }

  function expandOnce(source, id, rules, propositions) {
    const hit = allApplications(source, rules, propositions).find(item => item.id === id);
    if (!hit) return null;
    if (hit.type === 'proposition') {
      const substitutions = freshSubstitutions(source, hit);
      let replacement = instantiateTemplate(
        hit.variant.template, substitutions, hit.originalConclusion
      );
      replacement = freshenLocalDischarges(source, replacement, hit.variant.locals);
      if (hit.variant.kind === 'theorem') {
        replacement = freshenTheoremLabels(source, replacement);
      } else {
        if (!replacement.includes('@@PE_PREMISE_0@@')) {
          throw new Error('Proposition proof contains no premise attachment point');
        }
        replacement = replacement.replaceAll('@@PE_PREMISE_0@@', hit.premiseSources[0]);
      }
      if (/@@PE_(?:PREMISE|LOCAL)_/.test(replacement)) {
        throw new Error('Unresolved placeholder in proposition proof');
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    if (hit.rule.kind === 'forall-i-star') {
      let replacement = hit.premiseSources[0];
      for (const formula of hit.forallStar.steps) {
        replacement += `\n\\RightLabel{\\(\\forall\\)-I}\n\\UnaryInfC{${formula}}`;
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    if (hit.rule.kind === 'unique' && hit.rule.variant === 'atmost-intro') {
      return expandAtMostIntroduction(source, hit);
    }
    if (hit.rule.kind === 'unique') {
      let replacement = uniqueTemplate(hit);
      if (hit.premiseOrder.length === 2 && hit.premiseOrder[0] === 1) {
        replacement = preserveBinaryPremiseOrder(replacement);
      }
      for (let i = 0; i < hit.premiseSources.length; i++) {
        replacement = replacement.replaceAll(`@@PE_PREMISE_${i}@@`, hit.premiseSources[i]);
      }
      if (replacement.includes('@@PE_PREMISE_')) {
        throw new Error('Unresolved unique-existence premise placeholder');
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    if (hit.rule.kind === 'restricted') {
      let replacement = restrictedTemplate(hit);
      if (hit.rule.mode === 'exists-e') {
        hit.premiseSources[1] = replaceRestrictedAssumptions(
          hit.premiseSources[1], hit.restricted
        );
      }
      if (hit.premiseOrder.length === 2 && hit.premiseOrder[0] === 1) {
        replacement = preserveBinaryPremiseOrder(replacement);
      }
      for (let i = 0; i < hit.premiseSources.length; i++) {
        replacement = replacement.replaceAll(`@@PE_PREMISE_${i}@@`, hit.premiseSources[i]);
      }
      if (hit.rule.mode === 'exists-e') {
        replacement = freshenLocalDischarges(source, replacement, ['k']);
      }
      if (/@@PE_(?:PREMISE|LOCAL)_/.test(replacement)) {
        throw new Error('Unresolved restricted-quantifier proof placeholder');
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    const substitutions = freshSubstitutions(source, hit);
    let replacement = instantiateTemplate(
      hit.rule.template, substitutions, hit.originalConclusion
    );
    if (hit.rule.kind === 'subproof') {
      if (!hit.dischargeTag || !replacement.includes('@@PE_DISCHARGE@@')) {
        throw new Error('Missing discharge marker in the registered subproof');
      }
      replacement = replacement.replaceAll('@@PE_DISCHARGE@@',
        hit.dischargeTag);
    }
    replacement = freshenLocalDischarges(source, replacement, hit.rule.locals);
    if (hit.premiseOrder?.length === 2 && hit.premiseOrder[0] === 1) {
      replacement = preserveBinaryPremiseOrder(replacement);
    }
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

  // A direction of a proposition may consist solely of forwarding the
  // existing premise to an earlier proposition. That is a real dependency,
  // but it introduces no new proof steps. Transparently expand the earlier
  // proposition in the same click, preserving both provenance links.
  function isPropositionForwarder(hit) {
    return hit?.type === 'proposition' &&
      /^@@PE_PREMISE_0@@\s*\\(?:RightLabel|RL)\s*\{\s*P\s*\\href\{[^{}]+\}\{[^{}]+\}\s*\}\s*\\UnaryInfC\s*\{[^{}]*\}\s*$/.test(
        hit.variant.template.trim()
      );
  }

  function expandWithForwarding(source, id, rules, propositions) {
    const application = allApplications(source, rules, propositions)
      .find(hit => hit.id === id);
    if (!application) return null;
    let next = expandOnce(source, id, rules, propositions);
    if (!next) return null;
    const origins = application.type === 'proposition'
      ? [application.proposition] : [];

    if (isPropositionForwarder(application)) {
      const forwarded = allApplications(next, rules, propositions).find(hit =>
        hit.type === 'proposition' &&
        hit.start === application.start &&
        hit.proposition.id !== application.proposition.id
      );
      if (forwarded) {
        const further = expandOnce(next, forwarded.id, rules, propositions);
        if (further) {
          next = further;
          origins.push(forwarded.proposition);
        }
      }
    }
    return {source: next, origins};
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

  function initialize(stage, item, rules, propositions, dependencies = {}, registryIssue = '') {
    const texEngine = window.MathJax;
    if (typeof texEngine?.tex2svgPromise !== 'function') {
      throw new Error('MathJax SVG renderer unavailable');
    }
    const toolbar = document.querySelector('.proof-explorer-toolbar');
    if (!toolbar) return;
    const fit = toolbar.querySelector('button[aria-label="Fit proof to window"]');
    let output = item.typesetRoot;
    let source = item.math;
    const initialSource = source; // Immutable: the mathematical dependency view is not expansion-dependent.
    const history = [];
    const origins = [];  // provenance links, one per expansion
    const originSnapshots = []; // allow undoing Contract All and bulk operations exactly
    let busy = false;
    let bulkBusy = false;

    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo expansion';
    undo.disabled = true;
    const hint = document.createElement('span');
    hint.className = 'proof-explorer-expansion-note';
    hint.setAttribute('role', 'status');
    const provenance = document.createElement('span');
    provenance.className = 'proof-explorer-provenance';
    // The original viewer supplies zoom controls and textbook navigation.
    // Move these existing controls rather than duplicating their event handlers.
    const heading = toolbar.querySelector('.proof-explorer-title');
    const back = toolbar.querySelector('a[href]');
    const minus = toolbar.querySelector('button[aria-label="Zoom out"]');
    const plus = toolbar.querySelector('button[aria-label="Zoom in"]');
    const makeButton = (name, text) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', name);
      return b;
    };
    const expandAll = makeButton('Expand all rules', 'Expand all');
    const contractAll = makeButton('Contract all rules', 'Contract all');
    const depsToggle = makeButton('Toggle theorem dependencies', 'Dependencies');
    depsToggle.setAttribute('aria-expanded', 'false');
    const count = document.createElement('span');
    count.className = 'pe-expanded-count';
    const head = document.createElement('div'); head.className = 'pe-toolbar-head';
    const title = document.createElement('span');
    if (heading) title.append(heading, count);
    head.append(title);
    if (back) head.append(back);
    const actions = document.createElement('div'); actions.className = 'pe-toolbar-actions';
    const expansionGroup = document.createElement('div'); expansionGroup.className = 'pe-toolbar-action-group';
    expansionGroup.append(expandAll, contractAll, undo);
    const navigationGroup = document.createElement('div'); navigationGroup.className = 'pe-toolbar-action-group';
    if (minus) navigationGroup.append(minus);
    if (plus) navigationGroup.append(plus);
    if (fit) navigationGroup.append(fit);
    navigationGroup.append(depsToggle);
    actions.append(expansionGroup, navigationGroup);
    const statusRow = document.createElement('div'); statusRow.className = 'pe-toolbar-status';
    statusRow.append(hint, provenance);
    toolbar.replaceChildren(head, actions, statusRow);

    // The side panel does not observe visual proof expansions. Its inputs are
    // the original authored proof and build-time result metadata, exclusively.
    const overlay = toolbar.closest('.proof-explorer-overlay');
    const viewport = overlay?.querySelector('.proof-explorer-viewport');
    const workspace = document.createElement('div'); workspace.className = 'pe-workspace';
    const sidebar = document.createElement('aside'); sidebar.className = 'pe-dependency-panel';
    sidebar.setAttribute('aria-label', 'Theorem and axiom dependencies');
    sidebar.hidden = true;
    if (viewport && overlay) {
      overlay.insertBefore(workspace, viewport);
      workspace.append(viewport, sidebar);
    }
    // The dependency graph is built from authored proofs at publication time.
    // This view takes a snapshot of the original proof; it never observes
    // expansion/contract state. Derived rules are transparent graph edges.
    const dependencyIndex = dependencies?.results || {};
    const axiomLookup = dependencies?.axioms || {};
    const dependencyRules = dependencies?.rules || {};
    const dependencyRuleLabels = dependencies?.ruleLabels || {};
    // Axiom labels and their short rule names resolve to exactly the same
    // result. Their textual names live in the generated registry.
    const axiomAliases = new Map(Object.entries(axiomLookup)
      .filter(([, entry]) => entry?.shortName)
      .map(([number, entry]) => [entry.shortName, number]));
    const depCategoryOrder = id => id.startsWith('axiom:number:') ||
      dependencyIndex[id]?.kind === 'axiom' ? 0 : id.startsWith('rule:') ? 2 : 1;
    function dependencySort(ids) {
      return [...new Set(ids)].sort((a, b) =>
        depCategoryOrder(a) - depCategoryOrder(b) || a.localeCompare(b));
    }
    function dependencyBaseLabel(raw) {
      const withoutMath = normalizeRuleLabel(raw || '');
      return withoutMath.replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\(?:operatorname|text)\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\mathrm(?=[A-Za-z])/g, '')
        .split(',')[0];
    }
    const DEP_PURE_LOGIC = /^(?:\\(?:forall|exists|land|lor|leftrightarrow|to|neg|bot|top|equiv)(?:_S)?(?:-[IE]\*?)?|=-(?:I|E)|CR|RAA)$/;
    function extractDependencies(tex) {
      const direct = new Set();
      const issues = new Set();
      const command = /\\(?:RightLabel|RL)\b/g;
      let match;
      while ((match = command.exec(tex))) {
        const arg = braced(tex, command.lastIndex);
        if (!arg) { issues.add('Could not read a proof inference label'); break; }
        command.lastIndex = arg.end;
        const raw = arg.content;
        // Lwarp's resolved references have the form
        // \href{Chapter.html#prop:foo}{1.2}; use the stable anchor, not the
        // displayed number, which may change between editions.
        const href = /\\href\s*\{[^{}]*?#((?:ax|axiom|prop|th|thm|lem|lemma|cor|meta):[^{}#]+)\}\s*\{[^{}]*\}/g;
        let link;
        let cited = false;
        while ((link = href.exec(raw))) { direct.add(link[1]); cited = true; }
        const ref = /\\ref\s*\{((?:ax|axiom|prop|th|thm|lem|lemma|cor|meta):[^{}]+)\}/g;
        while ((link = ref.exec(raw))) { direct.add(link[1]); cited = true; }
        if (cited) continue;
        const base = dependencyBaseLabel(raw);
        if (!base || /^[1-9]\d*$/.test(base) || /^[a-z]$/.test(base)) continue;
        const axiom = /^A_?\{?(\d+)\}?$/.exec(base);
        if (axiom) { direct.add('axiom:number:' + axiom[1]); continue; }
        if (axiomAliases.has(base)) {
          direct.add('axiom:number:' + axiomAliases.get(base)); continue;
        }
        const transparent = dependencyRuleLabels[base];
        if (transparent?.length) { transparent.forEach(id => direct.add(id)); continue; }
        if (base === 'Def.' || base === 'Def' || base === 'Definition' || base.startsWith('D')) continue;
        if (DEP_PURE_LOGIC.test(base)) continue;
        issues.add('Unindexed inference rule: ' + base);
      }
      return {direct: dependencySort(direct), issues: [...issues]};
    }
    const authoredDependencies = extractDependencies(initialSource);
    // A missing registry must be visible as an unresolved dependency path,
    // never misreported as a proof using no axioms.
    if (registryIssue) authoredDependencies.issues.push(registryIssue);
    const immediateDependencies = authoredDependencies.direct;
    const dependencyRoots = dependencySort(immediateDependencies);

    function dependencyRecord(id) {
      if (id.startsWith('axiom:number:')) {
        const number = id.slice('axiom:number:'.length);
        const axiom = axiomLookup[number];
        return {id, kind: 'axiom', number: 'A' + number,
          reference: axiom?.reference || 'A' + number,
          title: axiom?.title || '', url: axiom?.url || null,
          requires: [], issues: axiom ? [] : ['Unknown axiom reference A' + number]};
      }
      if (id.startsWith('rule:')) {
        const record = dependencyRules[id];
        return record ? {...record, kind: 'rule'} :
          {id, kind: 'rule', requires: [], issues: ['Unindexed derived rule: ' + id]};
      }
      const record = dependencyIndex[id];
      if (record?.kind === 'axiom') {
        const knownNumber = Object.entries(axiomLookup)
          .find(([, entry]) => entry.id === id)?.[0];
        return {...record, number: knownNumber ? 'A' + knownNumber : record.number,
          reference: knownNumber ? 'A' + knownNumber : (record.reference || record.number),
          requires: [], issues: []};
      }
      return record || {id, kind: 'missing', title: id, requires: [],
        issues: ['Unindexed mathematical result: ' + id]};
    }
    function traceDependencies() {
      const foundations = new Map();
      const problems = new Set(authoredDependencies.issues);
      const observed = new Set();
      function visit(id, stack) {
        const node = dependencyRecord(id);
        if (stack.has(id)) { problems.add('Cyclic dependency involving ' + id); return; }
        if (node.kind === 'axiom') {
          foundations.set(node.number, node);
          // The axiom is still a foundational dependency even if its source
          // cannot be linked: make the missing source visible.
          for (const issue of node.issues || []) problems.add(issue);
          return;
        }
        for (const issue of node.issues || []) problems.add(issue);
        if (observed.has(id)) return;
        observed.add(id);
        const next = new Set(stack); next.add(id);
        for (const child of node.requires || []) visit(child, next);
      }
      dependencyRoots.forEach(id => visit(id, new Set()));
      return {foundations: [...foundations.values()].sort((a, b) =>
          Number(a.number.slice(1)) - Number(b.number.slice(1))),
        problems: [...problems].sort()};
    }
    const dependencyTrace = traceDependencies();

    const subscripts = '₀₁₂₃₄₅₆₇₈₉';
    function dependencyReference(node) {
      let raw = String(node.reference || node.number || '').trim();
      if (!raw) return '';
      if (node.kind === 'axiom') {
        const match = /^A_?\{?(\d+)\}?$/.exec(raw);
        return match ? 'A' + [...match[1]].map(digit => subscripts[Number(digit)]).join('') : raw;
      }
      const prefix = {proposition:'P', theorem:'T', lemma:'L',
        corollary:'C', metatheorem:'M'}[node.kind] || '';
      return prefix && /^\d/.test(raw) ? prefix + raw : raw;
    }
    function dependencyDisplayName(node) {
      const reference = dependencyReference(node);
      const title = String(node.title || '').trim();
      return reference && title && reference !== title ? reference + ' — ' + title :
        reference || title || node.id;
    }

    function dependencyLink(node, text) {
      if (!node.url) return document.createTextNode(text);
      const link = document.createElement('a');
      link.href = node.url; link.textContent = text;
      link.title = 'Open result in textbook';
      return link;
    }
    function hasVisibleDependency(id, stack = new Set()) {
      if (stack.has(id)) return true; // a cycle is itself a visible warning
      const node = dependencyRecord(id);
      if (node.kind !== 'rule' || (node.issues || []).length) return true;
      const next = new Set(stack); next.add(id);
      return (node.requires || []).some(child => hasVisibleDependency(child, next));
    }
    function visibleDependencies(ids) {
      return dependencySort(ids).filter(id => hasVisibleDependency(id));
    }
    function renderDependencyBranch(id, ancestors = new Set(), depth = 0) {
      const node = dependencyRecord(id);
      const fragment = document.createDocumentFragment();
      if (node.kind === 'rule') {
        // A rule justifies a step but does not become its own result node.
        if (ancestors.has(id)) {
          const message = document.createElement('li');
          message.className = 'pe-dependency-warning';
          message.textContent = 'Cyclic rule reference: ' + id;
          fragment.append(message); return fragment;
        }
        const next = new Set(ancestors); next.add(id);
        for (const child of visibleDependencies(node.requires || [])) {
          fragment.append(renderDependencyBranch(child, next, depth));
        }
        for (const issue of node.issues || []) {
          const warning = document.createElement('li');
          warning.className = 'pe-dependency-warning';
          warning.textContent = issue; fragment.append(warning);
        }
        return fragment;
      }
      const li = document.createElement('li');
      const label = dependencyDisplayName(node);
      const children = visibleDependencies(node.requires || []);
      if (ancestors.has(id)) {
        li.textContent = label + ' (cycle)';
        li.className = 'pe-dependency-warning';
      } else if (children.length || (node.issues || []).length) {
        const details = document.createElement('details');
        details.open = depth < 2;
        const summary = document.createElement('summary');
        summary.append(dependencyLink(node, label));
        details.append(summary);
        const sublist = document.createElement('ul');
        const next = new Set(ancestors); next.add(id);
        for (const child of children) sublist.append(renderDependencyBranch(child, next, depth + 1));
        for (const issue of node.issues || []) {
          const warning = document.createElement('li');
          warning.className = 'pe-dependency-warning';
          warning.textContent = issue; sublist.append(warning);
        }
        details.append(sublist);
        li.append(details);
      } else {
        li.append(dependencyLink(node, label));
        li.className = node.kind === 'axiom' ? 'pe-dependency-axiom' : '';
      }
      fragment.append(li); return fragment;
    }

    function renderDependencies() {
      sidebar.replaceChildren();
      const header = document.createElement('div');
      header.className = 'pe-dependency-heading';
      const title = document.createElement('h2'); title.textContent = 'Axiomatic Foundations';
      const help = document.createElement('details');
      help.className = 'pe-dependency-help';
      const helpToggle = document.createElement('summary');
      helpToggle.textContent = '?'; helpToggle.title = 'About dependency tracking';
      helpToggle.setAttribute('aria-label', 'About dependency tracking');
      const explanation = document.createElement('p');
      explanation.textContent = 'Axioms used by this authored proof, including through earlier results. ' +
        'Definitions and logical rules are omitted. These are the axioms used by the chosen proof, ' +
        'not necessarily the fewest axioms from which the theorem can be proved.';
      help.append(helpToggle, explanation);
      header.append(title, help); sidebar.append(header);
      const summary = document.createElement('div');
      summary.className = 'pe-foundations';
      if (dependencyTrace.foundations.length) {
        for (const axiom of dependencyTrace.foundations) {
          const chip = document.createElement('span');
          chip.className = 'pe-foundation-axiom';
          chip.append(dependencyLink(axiom, dependencyDisplayName(axiom)));
          chip.title = axiom.title || dependencyReference(axiom);
          summary.append(chip);
        }
      } else {
        const empty = document.createElement('p');
        empty.className = 'pe-dependency-empty';
        empty.textContent = 'No axioms identified in the indexed dependency paths.';
        summary.append(empty);
      }
      sidebar.append(summary);
      if (dependencyTrace.problems.length) {
        const coverage = document.createElement('p');
        coverage.className = 'pe-dependency-coverage';
        coverage.textContent = 'Partially traced — ' + dependencyTrace.problems.length +
          ' unresolved ' + (dependencyTrace.problems.length === 1 ? 'path' : 'paths');
        sidebar.append(coverage);
      }
      const hierarchyTitle = document.createElement('h3');
      hierarchyTitle.textContent = 'Dependency Hierarchy';
      sidebar.append(hierarchyTitle);
      const list = document.createElement('ul'); list.className = 'pe-dependency-tree';
      visibleDependencies(dependencyRoots).forEach(id => list.append(renderDependencyBranch(id)));
      if (list.children.length) sidebar.append(list);
      else {
        const empty = document.createElement('p');
        empty.className = 'pe-dependency-empty';
        empty.textContent = 'No cited axioms or prior results found in this proof.';
        sidebar.append(empty);
      }
      if (dependencyTrace.problems.length) {
        const details = document.createElement('details');
        details.className = 'pe-dependency-problems';
        const summary = document.createElement('summary');
        summary.textContent = 'Unresolved Paths (' + dependencyTrace.problems.length + ')';
        details.append(summary);
        const list = document.createElement('ul');
        for (const problem of dependencyTrace.problems) {
          const li = document.createElement('li'); li.textContent = problem;
          list.append(li);
        }
        details.append(list); sidebar.append(details);
      }
    }
    renderDependencies();
    depsToggle.addEventListener('click', () => {
      sidebar.hidden = !sidebar.hidden;
      depsToggle.setAttribute('aria-expanded', String(!sidebar.hidden));
      // The proof should stay at its existing scale and may be panned as usual.
      stage.proofExplorerCenterIfFits?.();
      stage.proofExplorerSyncLines?.();
    });

    function showProvenance() {
      provenance.replaceChildren();
      const refs = origins.flatMap(value =>
        Array.isArray(value) ? value : value ? [value] : []);
      if (!refs.length) return;
      provenance.append(document.createTextNode('Expanded from: '));
      refs.slice(-8).forEach((ref, i) => {
        if (i) provenance.append(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.href = ref.url;
        link.textContent = `P${ref.number}`;
        link.title = 'Open the original proposition in the textbook';
        provenance.append(link);
      });
      if (refs.length > 8) provenance.append(document.createTextNode(` · +${refs.length - 8} earlier`));
    }

    // Lay out the entire inference subtree, not only the width of its last
    // formula.  MathJax bussproofs can overlap branches with deep descendants.
    const fragmentCache = new Map();
    function parseLayoutTree(tex) {
      const nodes = []; let label = '', leftLabel = '', line = 'solid';
      const arity = {UnaryInfC:1,BinaryInfC:2,TrinaryInfC:3,QuaternaryInfC:4,QuinaryInfC:5};
      const commands = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL|LeftLabel|LL|noLine|dashedLine|solidLine|singleLine|alwaysNoLine|alwaysDashedLine|alwaysSolidLine|alwaysSingleLine)\b/g;
      let m;
      while ((m = commands.exec(tex))) {
        const name = m[1];
        if (name==='noLine'||name==='alwaysNoLine') {line='none';continue;}
        if (/^(always)?DashedLine$/.test(name) || name==='dashedLine') {line='dashed';continue;}
        if (/^(always)?SolidLine$/.test(name) || name==='solidLine' || name==='singleLine' || name==='alwaysSingleLine') {line='solid';continue;}
        const arg = braced(tex,commands.lastIndex);
        if (!arg) throw new Error('Malformed proof-tree argument: '+name);
        commands.lastIndex=arg.end;
        if (name==='RightLabel'||name==='RL') {label=arg.content;continue;}
        if (name==='LeftLabel'||name==='LL') {leftLabel=arg.content;continue;}
        if (name==='AxiomC') {
          nodes.push({formula:arg.content,children:[],leaf:true});label=leftLabel='';continue;
        }
        const n=arity[name];
        if (!n||nodes.length<n) throw new Error('Disconnected or malformed proof tree');
        nodes.push({formula:arg.content,children:nodes.splice(-n,n),leaf:false,
                    label,leftLabel,line});label=leftLabel='';line='solid';
      }
      if (nodes.length!==1) throw new Error('Malformed proof tree: '+nodes.length+' roots');
      return nodes[0];
    }
    function fragmentTex(raw) {
      return raw.trim().replace(/\\\(|\\\)|\\\[|\\\]/g,'').replace(/\$/g,'');
    }
    async function proofMath(raw) {
      const tex=fragmentTex(raw);
      if (!tex) return document.createElement('span');
      let ready=fragmentCache.get(tex);
      if (!ready) {
        ready=texEngine.tex2svgPromise(tex,{display:false}).then(el=>{
          if (!el.querySelector('svg')||el.querySelector('merror,[data-mml-node="merror"]'))
            throw new Error('Proof math failed: '+tex);
          return el;
        });
        fragmentCache.set(tex,ready);
      }
      return (await ready).cloneNode(true);
    }
    // A bussproofs RightLabel is ordinary mixed-mode text, not one formula.
    // e.g. "\\(\\to\\)-I, 2" has a mathematical arrow but roman "-I, 2".
    // The previous custom renderer removed math delimiters and sent the WHOLE
    // label to MathJax, wrongly italicizing the text and ignoring scriptsize.
    // Parse only genuine math segments as TeX; preserve text and hyperlink
    // segments (including the Explorer's separate expandable rule controls).
    async function proofLabel(raw) {
      const result = document.createDocumentFragment();
      const source = raw.trim();
      let plain = '';
      const flush = () => {
        if (plain) { result.append(document.createTextNode(plain)); plain = ''; }
      };
      for (let i = 0; i < source.length;) {
        const mathOpen = source.startsWith('\\(', i) ? ['\\)', 2]
          : source.startsWith('\\[', i) ? ['\\]', 2]
          : source[i] === '$' && source[i-1] !== '\\' ? ['$', 1] : null;
        if (mathOpen) {
          const [close, openLength] = mathOpen;
          const end = source.indexOf(close, i + openLength);
          if (end !== -1) {
            flush();
            const content = source.slice(i + openLength, end);
            result.append(await proofMath(content));
            i = end + close.length;
            continue;
          }
        }
        if (source.startsWith('\\href', i) && !/[A-Za-z]/.test(source[i+5] || '')) {
          const destination = braced(source, i + 5);
          const linkText = destination && braced(source, destination.end);
          if (linkText) {
            flush();
            const anchor = document.createElement('a');
            anchor.setAttribute('href', destination.content);
            anchor.append(await proofLabel(linkText.content));
            result.append(anchor);
            i = linkText.end;
            continue;
          }
        }
        // Explicit font-size commands in a label have the same meaning as
        // the renderer's scriptsize styling; never print them as plain text.
        const fontCommand = /^\\(?:scriptsize|tiny|footnotesize|normalsize)\b/.exec(source.slice(i));
        if (fontCommand) { flush(); i += fontCommand[0].length; continue; }
        // Un-delimited TeX commands used inside a label are rare, but still
        // allow them to be typeset instead of exposing backslash text.
        const bareCommand = /^\\(?:mathrm|mathsf|textbf|mathbf|operatorname)\b/.exec(source.slice(i));
        if (bareCommand) {
          const argument = braced(source, i + bareCommand[0].length);
          if (argument) {
            flush();
            result.append(await proofMath(source.slice(i, argument.end)));
            i = argument.end;
            continue;
          }
        }
        plain += source[i++];
      }
      flush();
      return result;
    }

    async function proofBranch(node) {
      const container=document.createElement('span');
      container.className='pe-node'+(node.leaf?' pe-leaf':'');
      if (node.children.length) {
        const premises=document.createElement('span');premises.className='pe-premises';
        for (const child of node.children) premises.append(await proofBranch(child));
        container.append(premises);
      }
      const conclusion=document.createElement('span');conclusion.className='pe-conclusion';
      if (node.formula.trim()) conclusion.append(await proofMath(node.formula));
      if (node.leaf) container.append(conclusion);
      else {
        const step=document.createElement('span');step.className='pe-step';
        const row=document.createElement('span');row.className='pe-rule-row';
        if (node.leftLabel) {
          const l=document.createElement('span');l.className='pe-label pe-left-label';
          l.append(await proofLabel(node.leftLabel));row.append(l);
        }
        const bar=document.createElement('span');bar.className='pe-bar pe-'+node.line;
        row.append(bar);
        if (node.label) {
          const l=document.createElement('span');l.className='pe-label pe-right-label';
          l.append(await proofLabel(node.label));row.append(l);
        }
        step.append(row,conclusion);container.append(step);
      }
      return container;
    }
    async function drawProof(markedSource) {
      const outer=document.createElement('span');outer.className='pe-tree';
      outer.append(await proofBranch(parseLayoutTree(markedSource)));
      return outer;
    }

    // The proof's *layout box* must reserve enough space for a right-hand
    // inference label to sit outside the immediately adjacent formulas.
    // First reserve only the missing side clearance, bottom-up. The premises
    // stay in their normal nested layout; we do not translate formulas or
    // reparent branches. Then trim the painted lines independently.
    function inferenceLayoutAnchors(node) {
      const premises = [...node.children].find(el => el.classList.contains('pe-premises'));
      const step = [...node.children].find(el => el.classList.contains('pe-step'));
      if (!premises || !step) return null;
      const row = step.querySelector(':scope > .pe-rule-row');
      const conclusion = step.querySelector(':scope > .pe-conclusion');
      const bar = row?.querySelector(':scope > .pe-bar');
      if (!row || !conclusion || !bar) return null;
      const anchors = [conclusion];
      for (const child of premises.children) {
        const childStep = [...child.children].find(el => el.classList.contains('pe-step'));
        const childConclusion = childStep
          ? childStep.querySelector(':scope > .pe-conclusion')
          : [...child.children].find(el => el.classList.contains('pe-conclusion'));
        if (childConclusion) anchors.push(childConclusion);
      }
      return {row, step, bar, anchors};
    }

    function inferenceLineMetrics(layout) {
      const {row, anchors} = layout;
      const rowRect = row.getBoundingClientRect();
      if (!rowRect.width || !row.offsetWidth) return null;
      const scale = rowRect.width / row.offsetWidth;
      const toX = x => (x - rowRect.left) / scale;
      const fontSize = parseFloat(getComputedStyle(row).fontSize) || 16;
      // The first margin is visible inference line beyond the formulas;
      // the second is the gap from its endpoint to the printed rule label.
      const padding = fontSize * .60;
      const gap = fontSize * .35;
      const minimum = fontSize * 1.25;
      const rectangles = anchors.map(el => el.getBoundingClientRect())
        .filter(rect => rect.width > 1 && rect.height > 0);
      if (!rectangles.length) return null;
      const naturalLeft = Math.min(...rectangles.map(rect => toX(rect.left))) - padding;
      const naturalRight = Math.max(...rectangles.map(rect => toX(rect.right))) + padding;
      const leftLabel = row.querySelector(':scope > .pe-left-label');
      const rightLabel = row.querySelector(':scope > .pe-right-label');
      const leftWidth = leftLabel ? leftLabel.getBoundingClientRect().width / scale : 0;
      const rightWidth = rightLabel ? rightLabel.getBoundingClientRect().width / scale : 0;
      const parentNode = row.closest('.pe-node');
      const reservedLeft = parseFloat(parentNode?.style.paddingLeft) || 0;
      const reservedRight = parseFloat(parentNode?.style.paddingRight) || 0;
      const lower = (leftLabel ? leftWidth + gap : 0) - reservedLeft;
      const upper = row.offsetWidth + reservedRight - (rightLabel ? rightWidth + gap : 0);
      return {row, scale, toX, naturalLeft, naturalRight, minimum,
              gap, leftLabel, rightLabel, leftWidth, lower, upper};
    }

    function trimInferenceLines(tree) {
      const nodes = [...tree.querySelectorAll('.pe-node:not(.pe-leaf)')];
      // Reserve the smallest needed right/left overhang as side padding on the
      // whole subtree. That keeps the internal premise positions unchanged
      // while sibling branches still account for the extra occupied width.
      // Reading nodes in reverse makes child widths stable before parents.
      for (const node of nodes.reverse()) {
        const layout = inferenceLayoutAnchors(node);
        if (!layout) continue;
        const measured = inferenceLineMetrics(layout);
        if (!measured) continue;
        const {naturalLeft, naturalRight, lower, upper} = measured;
        const shortfallRight = Math.max(0, naturalRight - upper);
        const shortfallLeft = Math.max(0, lower - naturalLeft);
        if (shortfallRight > .5) node.style.paddingRight = `${Math.ceil(shortfallRight + 2)}px`;
        if (shortfallLeft > .5) node.style.paddingLeft = `${Math.ceil(shortfallLeft + 2)}px`;
      }
      // The reserved layout is now stable; move only the visible line ends
      // and labels, never the premises or conclusions.
      for (const node of nodes) {
        const layout = inferenceLayoutAnchors(node);
        if (!layout) continue;
        const measured = inferenceLineMetrics(layout);
        if (!measured) continue;
        const {row, scale, toX, naturalLeft, naturalRight, minimum,
               gap, leftLabel, rightLabel, leftWidth, lower, upper} = measured;
        const room = upper - lower;
        if (room <= 0) continue;
        const required = Math.min(minimum, room);
        const left = Math.max(lower, Math.min(naturalLeft, upper - required));
        const right = Math.min(upper, Math.max(naturalRight, left + required));

        layout.bar.style.setProperty('--pe-line-left', `${left}px`);
        layout.bar.style.setProperty('--pe-line-width', `${right - left}px`);
        if (leftLabel) {
          const originalLeft = toX(leftLabel.getBoundingClientRect().left);
          leftLabel.style.transform = `translateX(${left - gap - leftWidth - originalLeft}px)`;
        }
        if (rightLabel) {
          const originalLeft = toX(rightLabel.getBoundingClientRect().left);
          rightLabel.style.transform = `translateX(${right + gap - originalLeft}px)`;
        }
      }
    }

    async function render() {
      const prepared = markExpandableRules(source, rules, propositions);
      let replacement;
      try {
        replacement = await drawProof(prepared.tex);
      } catch (layoutError) {
        // Retain the earlier renderer for an unsupported proof-tree command.
        console.warn('Proof Explorer: full-subtree layout unavailable; using MathJax', layoutError);
        replacement = await texEngine.tex2svgPromise(prepared.tex, {display: true});
      }
      const oldBox = output.getBoundingClientRect();
      output.replaceWith(replacement);
      output = replacement;
      if (replacement.classList.contains('pe-tree')) trimInferenceLines(replacement);
      // Update viewport-level inference strokes from their freshly trimmed geometry.
      // The SVG stays outside the scaled stage throughout all zoom and pan events.
      stage.proofExplorerSyncLines?.();
      const newBox = replacement.getBoundingClientRect();
      if (oldBox && newBox && stage.proofExplorerPanBy) {
        stage.proofExplorerPanBy(
          (oldBox.left + oldBox.right - newBox.left - newBox.right) / 2,
          oldBox.bottom - newBox.bottom
        );
      }
      stage.proofExplorerCenterIfFits?.();
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
          typeof replacement.animate === 'function') {
        replacement.animate([{opacity: .15}, {opacity: 1}],
          {duration: 200, easing: 'ease-out'});
      }
      hint.textContent = registryIssue || (prepared.hits.length
        ? `Click ⊕ beside a derived rule or proposition to expand (${prepared.hits.length} available).`
        : history.length ? 'No further registered expansions in this tree.'
          : 'No registered expandable rules in this tree.');
      undo.disabled = history.length === 0;
      expandAll.disabled = prepared.hits.length === 0;
      contractAll.disabled = source === initialSource;
      count.textContent = `${history.length} action${history.length === 1 ? '' : 's'}`;
      showProvenance();
    }

    async function change(next, revert = false, origin = null, resetOrigins = false) {
      if (busy) return;
      busy = true;
      const before = source;
      const previousHistory = history.slice();
      const previousOrigins = origins.slice();
      const previousOriginSnapshots = originSnapshots.map(snapshot => snapshot.slice());
      source = next;
      if (revert) {
        history.pop();
        origins.splice(0, origins.length, ...(originSnapshots.pop() || []));
      } else {
        history.push(before);
        originSnapshots.push(previousOrigins);
        if (resetOrigins) origins.splice(0);
        else origins.push(origin);
      }
      try {
        await render();
      } catch (error) {
        source = before;
        history.splice(0, history.length, ...previousHistory);
        origins.splice(0, origins.length, ...previousOrigins);
        originSnapshots.splice(0, originSnapshots.length, ...previousOriginSnapshots);
        undo.disabled = history.length === 0;
        hint.textContent = 'Could not redraw the tree; original kept.';
        console.error('Proof Explorer expansion:', error);
      } finally {
        busy = false;
      }
    }

    // Expand All is recursive: newly revealed rules are eligible immediately.
    // Commit as ONE history action and redraw only when the batch finishes.
    // Bounded work avoids locking a browser on a very large textbook proof.
    expandAll.addEventListener('click', async () => {
      if (busy || bulkBusy) return;
      bulkBusy = true;
      expandAll.disabled = contractAll.disabled = undo.disabled = true;
      let next = source;
      let expanded = 0;
      const acquired = [];
      const MAX_STEPS = 150;
      const MAX_SOURCE_LENGTH = 1000000;
      try {
        while (expanded < MAX_STEPS && next.length < MAX_SOURCE_LENGTH) {
          const candidates = allApplications(next, rules, propositions);
          if (!candidates.length) break;
          let replacement = null;
          for (const candidate of candidates.slice().reverse()) {
            try {
              const proposed = expandWithForwarding(next, candidate.id, rules, propositions);
              if (proposed && proposed.source !== next) {
                replacement = proposed; break;
              }
            } catch (error) {
              console.warn('Skipping unavailable expansion:', error);
            }
          }
          if (!replacement) break;
          next = replacement.source;
          acquired.push(...replacement.origins);
          expanded++;
          if (expanded % 8 === 0) {
            hint.textContent = `Expanding… ${expanded} inferences`;
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
        }
        if (next !== source) await change(next, false, acquired);
        if (expanded >= MAX_STEPS || next.length >= MAX_SOURCE_LENGTH) {
          hint.textContent = `Expanded ${expanded} inferences; safety limit reached. Expand all again to continue.`;
        }
      } catch (error) {
        console.error('Expand All:', error);
        hint.textContent = 'Expand All could not finish. The previous proof is unchanged.';
      } finally {
        bulkBusy = false;
        undo.disabled = history.length === 0;
        contractAll.disabled = source === initialSource;
        expandAll.disabled = allApplications(source, rules, propositions).length === 0;
      }
    });
    contractAll.addEventListener('click', () => {
      if (busy || bulkBusy || source === initialSource) return;
      change(initialSource, false, null, true);
    });

    stage.addEventListener('click', event => {
      if (busy || bulkBusy) return;
      const link = event.target.closest?.('a[href]');
      const href = link?.getAttribute('href');
      const prefix = href?.startsWith(LINK_PREFIX) ? LINK_PREFIX
        : href?.startsWith(PROP_LINK_PREFIX) ? PROP_LINK_PREFIX : null;
      if (!prefix) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = Number(href.slice(prefix.length));
      if (!Number.isSafeInteger(id)) return;
      try {
        const expansion = expandWithForwarding(source, id, rules, propositions);
        if (expansion) change(expansion.source, false,
          expansion.origins.length ? expansion.origins : null);
      } catch (error) {
        hint.textContent = 'Could not expand this rule; proof unchanged.';
        console.error('Proof Explorer expansion:', error);
      }
    }, true);
    undo.addEventListener('click', () => {
      if (busy || bulkBusy || !history.length) return;
      change(history[history.length - 1], true);
    });

    render().catch(error => {
      hint.textContent = 'Expansion is unavailable for this tree.';
      console.warn('Proof Explorer:', error);
    });
  }

  function showStartupWarning(message) {
    const toolbar = document.querySelector('.proof-explorer-toolbar');
    if (!toolbar) return;
    const target = toolbar.querySelector('.pe-toolbar-status') || toolbar;
    let warning = target.querySelector('.pe-explorer-warning');
    if (!warning) {
      warning = document.createElement('span');
      warning.className = 'pe-explorer-warning';
      warning.setAttribute('role', 'status');
      target.append(warning);
    }
    warning.textContent = message;
  }

  function start(rules, propositions, dependencies, registryIssue = '') {
    const stage = document.querySelector('.proof-explorer-stage');
    if (!stage) return false;
    const snippet = stage.querySelector(':scope > .formalderivation');
    const key = snippet?.style.getPropertyValue('--explorer-id').trim();
    if (key && [...document.querySelectorAll('.explorerderivation')]
      .some(el => el.style.getPropertyValue('--explorer-id').trim() === key)) return false;
    const item = locateExplorerMath(stage);
    if (!item) return false;
    try {
      initialize(stage, item, rules, propositions, dependencies, registryIssue);
    } catch (error) {
      // A diagnostic must remain visible in the viewer even if a future
      // registry or rendering change prevents constructing the new sidebar.
      console.error('Proof Explorer: could not initialize enhanced viewer:', error);
      showStartupWarning('Proof Explorer enhancement failed: ' + error.message +
        '. Zoom and textbook navigation remain available.');
      return true;
    }
    return true;
  }

  async function waitForExplorer() {
    const url = new URL('assets/proof-rules.json', location.href);
    // The basic proof viewer must never depend on the JSON registry. If the
    // registry is absent, stale or malformed, initialize the enhanced toolbar
    // with no expansion rules and an explicit incomplete-dependency warning.
    let data = {rules: {}, propositions: {}, dependencies: {}};
    let registryIssue = '';
    try {
      const response = await fetch(url, {cache: 'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const candidate = await response.json();
      if (candidate.version !== 7 || !candidate.rules || !candidate.propositions) {
        throw new Error('Incompatible proof registry (expected version 7)');
      }
      data = candidate;
    } catch (error) {
      console.warn('Proof Explorer: rule registry unavailable:', error);
      registryIssue = 'Proof registry unavailable (' + error.message +
        '). Expansions are disabled and the dependency index is incomplete.';
    }
    const rules = Object.values(data.rules);
    const propositions = data.propositions;
    const dependencies = data.dependencies || {};
    if (start(rules, propositions, dependencies, registryIssue)) return;
    // The full explorerderivation may be moved into the stage after MathJax
    // settles. Observe that transition without requiring proof JSON to load.
    const observer = new MutationObserver(() => {
      if (start(rules, propositions, dependencies, registryIssue)) observer.disconnect();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    setTimeout(() => {
      observer.disconnect();
      if (!document.querySelector('.pe-toolbar-head')) {
        showStartupWarning('Proof Explorer could not locate the authored MathJax derivation. ' +
          'Zoom and textbook navigation remain available.');
      }
    }, 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForExplorer, {once: true});
  } else {
    waitForExplorer();
  }
})();
