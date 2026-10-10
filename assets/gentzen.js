/* Contextual side panel for Gentzen derivations and illustrations. */

function setupGentzenPanels() {
  const main = document.querySelector('main.bodycontainer');
  const shell = main?.parentElement;
  if (!shell || !main) return;
  shell.classList.add('bodyandsidetoc');

  // Preserve the order in which figures and derivations occur in the text.
  const items = [...main.querySelectorAll('.formalderivation, .sideillustration')];
  if (items.length === 0) return;

  const panel = document.createElement('aside');
  panel.className = 'gentzen-panel';
  panel.id = 'gentzen-panel';
  panel.setAttribute('aria-label', 'Contextual illustrations and derivations');
  panel.setAttribute('aria-hidden', 'true');

  const card = document.createElement('div');
  card.className = 'gentzen-panel-card';
  const header = document.createElement('div');
  header.className = 'gentzen-panel-header';
  const title = document.createElement('strong');
  title.textContent = 'Formal derivation';
  const close = document.createElement('button');
  close.className = 'gentzen-close';
  close.type = 'button';
  close.textContent = 'Close';
  header.append(title, close);

  const content = document.createElement('div');
  content.className = 'gentzen-panel-content';
  card.append(header, content);
  panel.appendChild(card);
  shell.appendChild(panel);

  const buttons = new Map();
  const anchors = new Map();
  let active = null;

  const isIllustration = item => item.classList.contains('sideillustration');
  const itemLabel = item => isIllustration(item) ? 'illustration' : 'formal derivation';

  function alignWithContext() {
    if (!active || window.innerWidth < 1600) return;

    const anchor = anchors.get(active);
    if (!anchor) return;

    // Align a figure's image, or a derivation's visible MathJax tree.
    const visual = isIllustration(active)
      ? (active.querySelector('img, svg') || active)
      : (active.querySelector('p mjx-container') || active);

    // Reset before measuring so the previous selection's offset is not reused.
    panel.style.setProperty('--gentzen-anchor', '0px');

    const inset =
      visual.getBoundingClientRect().top -
      card.getBoundingClientRect().top;

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
        button.textContent = `Show ${itemLabel(active)}`;
        button.setAttribute('aria-expanded', 'false');
      }
      anchors.get(active)?.classList.remove('gentzen-linked-proof');
    }
    active = null;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    panel.style.removeProperty('--gentzen-anchor');
  }

  for (const item of items) {
    const figure = isIllustration(item);
    let anchor = null;
    let proof = null;

    if (figure) {
      // The prose immediately before the figure explains the illustration.
      const previous = item.previousElementSibling;
      if (previous?.matches('p')) anchor = previous;
    } else {
      // Retain the existing Gentzen behavior: locate the preceding prose proof.
      proof = item.previousElementSibling;
      let checked = 0;
      while (proof && !proof.matches('.amsthmproof') && checked++ < 6) {
        if (proof.matches('h1, h2, h3, h4, h5, h6')) break;
        proof = proof.previousElementSibling;
      }
      if (!proof?.matches('.amsthmproof')) proof = null;
    }

    const trigger = document.createElement('div');
    trigger.className = 'derivation-trigger';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Show ${itemLabel(item)}`;
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');
    trigger.append(button);

    // For figures, put the button where the HTML figure would have appeared.
    // For derivations, keep it before the associated prose proof.
    (figure ? item : (proof || item)).before(trigger);
    anchor ||= proof || trigger;
    anchors.set(item, anchor);

    content.append(item);
    item.hidden = true;
    buttons.set(item, button);

    if (figure) {
      // A freshly loaded SVG can change its dimensions after the first frame.
      for (const img of item.querySelectorAll('img')) {
        img.addEventListener('load', alignWithContext);
      }
    }

    button.addEventListener('click', () => {
      if (active === item) {
        hidePanel();
        return;
      }
      hidePanel();
      active = item;
      item.hidden = false;
      anchor.classList.add('gentzen-linked-proof');
      title.textContent = figure ? 'Illustration' : 'Formal derivation';
      button.textContent = `Hide ${itemLabel(item)}`;
      button.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      content.scrollTop = 0;
      requestAnimationFrame(alignWithContext);
    });
  }

  close.addEventListener('click', hidePanel);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hidePanel();
  });
  window.addEventListener('resize', alignWithContext);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => alignWithContext()).observe(main);
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
