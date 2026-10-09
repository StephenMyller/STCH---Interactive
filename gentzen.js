/* Lwarp sidecar derivations: keep prose in place and align trees to their proofs. */
const gentzenStyles = document.createElement('link');
gentzenStyles.rel = 'stylesheet';
gentzenStyles.href = 'gentzen-panel.css';
document.head.appendChild(gentzenStyles);

function setupGentzenPanels() {
  const shell = document.querySelector('div.bodyandsidetoc, div.bodywithoutsidetoc');
  const main = shell?.querySelector('main.bodycontainer');
  const derivations = [...(main?.querySelectorAll('.formalderivation') ?? [])];
  if (!shell || !main || derivations.length === 0) return;

  const panel = document.createElement('aside');
  panel.className = 'gentzen-panel';
  panel.id = 'gentzen-panel';
  panel.setAttribute('aria-label', 'Contextual formal derivation');
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

  function alignWithProof() {
    if (!active) return;
    const anchor = anchors.get(active);
    if (!anchor) return;
    // Desktop: make the header of the derivation line up with its prose proof.
    // Rectangles are relative to the same viewport, so scrolling cancels out.
    const offset = anchor.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    panel.style.setProperty('--gentzen-anchor', `${Math.max(0, offset)}px`);
  }

  function hidePanel() {
    if (active) {
      active.hidden = true;
      const button = buttons.get(active);
      button.textContent = 'Show formal derivation';
      button.setAttribute('aria-expanded', 'false');
      anchors.get(active)?.classList.remove('gentzen-linked-proof');
    }
    active = null;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
  }

  for (const derivation of derivations) {
    // Find the nearest preceding prose proof (allow intervening Lwarp elements).
    let proof = derivation.previousElementSibling;
    let checked = 0;
    while (proof && !proof.matches('.amsthmproof') && checked++ < 6) {
      if (proof.matches('h1, h2, h3, h4, h5, h6')) break;
      proof = proof.previousElementSibling;
    }
    if (!proof?.matches('.amsthmproof')) proof = null;

    const trigger = document.createElement('div');
    trigger.className = 'derivation-trigger';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Show formal derivation';
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');
    trigger.append(button);
    // Place the control immediately before the prose proof when possible.
    (proof || derivation).before(trigger);
    const anchor = proof || trigger;
    anchors.set(derivation, anchor);

    content.append(derivation);
    derivation.hidden = true;
    buttons.set(derivation, button);

    button.addEventListener('click', () => {
      if (active === derivation) {
        hidePanel();
        return;
      }
      hidePanel();
      active = derivation;
      derivation.hidden = false;
      anchor.classList.add('gentzen-linked-proof');
      button.textContent = 'Hide formal derivation';
      button.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      content.scrollTop = 0;
      alignWithProof();
    });
  }

  close.addEventListener('click', hidePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hidePanel();
  });
  window.addEventListener('resize', alignWithProof);
  gentzenStyles.addEventListener('load', alignWithProof);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => alignWithProof()).observe(main);
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
