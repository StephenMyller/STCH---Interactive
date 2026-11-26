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
    .pe-toolbar-title-block { display: flex; flex-direction: column; gap: .1rem;
      min-width: 0; flex: 1 1 auto; }
    .pe-toolbar-mainline { display: flex; align-items: baseline; flex-wrap: wrap;
      gap: .4rem; }
    .pe-toolbar-mainline .proof-explorer-title { margin-right: 0; }
    .pe-current-result { font-size: .98rem; font-weight: 600; line-height: 1.3;
      overflow-wrap: anywhere; }
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
    const numbered = /^\d+$/.test(requested) &&
      Number.isSafeInteger(ordinal) && ordinal >= 1;
    let selected;
    if (numbered) {
      // Preserve the existing sidebar-based entry route unchanged.
      selected = proofs[ordinal - 1];
    } else {
      // A standalone explorerderivation is addressed by its stable LaTeX ID.
      const matches = [...document.querySelectorAll('.explorerderivation')]
        .filter(proof =>
          proof.style.getPropertyValue('--explorer-id').trim() === requested);
      selected = matches.length === 1 ? matches[0] : undefined;
      if (matches.length > 1) {
        console.error(`Proof Explorer: duplicate derivation ID "${requested}".`);
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'proof-explorer-overlay';
    const toolbar = document.createElement('header');
    toolbar.className = 'proof-explorer-toolbar';
    const heading = document.createElement('strong');
    heading.className = 'proof-explorer-title';
    heading.textContent = numbered
      ? `Proof Explorer · ${ordinal}`
      : 'Proof Explorer';
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


