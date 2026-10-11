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
      // Keep the previously working Gentzen proof placement.
      proof = item.previousElementSibling;
      let checked = 0;
      while (proof && !proof.matches('.amsthmproof') && checked++ < 6) {
        if (proof.matches('h1, h2, h3, h4, h5, h6')) break;
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


