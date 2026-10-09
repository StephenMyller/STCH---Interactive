/* Progressive enhancement for Lwarp formal derivations. */
const gentzenStyles = document.createElement('link');
gentzenStyles.rel = 'stylesheet';
gentzenStyles.href = 'gentzen-panel.css';
document.head.appendChild(gentzenStyles);

function setupGentzenPanels() {
  const shell = document.querySelector('div.bodyandsidetoc, div.bodywithoutsidetoc');
  const derivations = [...document.querySelectorAll('main.bodycontainer .formalderivation')];
  if (!shell || derivations.length === 0) return;

  const panel = document.createElement('aside');
  panel.className = 'gentzen-panel';
  panel.id = 'gentzen-panel';
  panel.setAttribute('aria-label', 'Formal derivation panel');

  const header = document.createElement('div');
  header.className = 'gentzen-panel-header';
  const title = document.createElement('strong');
  title.textContent = 'Formal derivation';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'gentzen-close';
  close.textContent = 'Close';
  header.append(title, close);
  const content = document.createElement('div');
  content.className = 'gentzen-panel-content';
  panel.append(header, content);
  shell.appendChild(panel);

  let active = null;
  const buttons = new Map();

  function hidePanel() {
    if (active) {
      active.hidden = true;
      const button = buttons.get(active);
      button.textContent = 'Show formal derivation';
      button.setAttribute('aria-expanded', 'false');
    }
    active = null;
    panel.classList.remove('is-open');
  }

  derivations.forEach((derivation) => {
    const trigger = document.createElement('div');
    trigger.className = 'derivation-trigger';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Show formal derivation';
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');
    trigger.appendChild(button);
    derivation.before(trigger);
    content.appendChild(derivation);
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
      button.textContent = 'Hide formal derivation';
      button.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      panel.scrollTop = 0;
    });
  });

  close.addEventListener('click', hidePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hidePanel();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const promise = window.MathJax?.startup?.promise;
  if (promise && typeof promise.then === 'function') {
    promise.then(setupGentzenPanels, setupGentzenPanels);
  } else {
    setupGentzenPanels();
  }
});
