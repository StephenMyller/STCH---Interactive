/* Place the existing theme toggle INSIDE the actual Contents header.
   Lwarp can wrap the heading in intermediate divs, so do not require it
   to be a direct child of the sidebar container. This code does not
   recreate the button; its original theme handler and persistence remain. */
(() => {
  function placeThemeToggle() {
    const heading = document.querySelector('.sidetoccontainer .sidetoctitle')
      || document.querySelector('.sidetoctitle');
    const button = document.querySelector('.book-theme-toggle');
    if (!heading || !button) return false;

    if (button.parentElement !== heading) heading.appendChild(button);

    // Register the accessibility updater once, regardless of how often
    // other site scripts reconstruct their DOM.
    if (!button.dataset.contentsThemeReady) {
      button.dataset.contentsThemeReady = 'true';
      const update = () => {
        const dark = document.documentElement.dataset.bookTheme === 'dark';
        const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.setAttribute('aria-pressed', String(dark));
      };
      update();
      const themeObserver = new MutationObserver(update);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-book-theme']
      });
    }
    return true;
  }

  function initialize() {
    if (placeThemeToggle()) return;
    // The separate theme script may create the button only after our own
    // DOMContentLoaded listener. Observe until the required elements exist;
    // don't give up after an arbitrary timeout.
    const observer = new MutationObserver(() => {
      if (placeThemeToggle()) observer.disconnect();
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
    window.addEventListener('load', placeThemeToggle, {once: true});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, {once: true});
  } else {
    initialize();
  }
})();

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



