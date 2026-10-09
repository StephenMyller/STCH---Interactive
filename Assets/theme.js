
(() => {
  let stored;

  try {
    stored = localStorage.getItem('nbg-theme');
  } catch (_) {}

  const systemDark = window.matchMedia?.(
    '(prefers-color-scheme: dark)'
  ).matches;

  const startingTheme = ['light', 'dark'].includes(stored)
    ? stored
    : (systemDark ? 'dark' : 'light');

  document.documentElement.dataset.bookTheme = startingTheme;

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'book-theme-toggle';
    toggle.setAttribute('aria-label', 'Toggle night mode');

    function updateButton() {
      const dark =
        document.documentElement.dataset.bookTheme === 'dark';

      toggle.textContent = dark
        ? '☀ Light mode'
        : '☾ Night mode';

      toggle.setAttribute('aria-pressed', String(dark));
    }

    toggle.addEventListener('click', () => {
      const dark =
        document.documentElement.dataset.bookTheme === 'dark';

      const next = dark ? 'light' : 'dark';
      document.documentElement.dataset.bookTheme = next;

      try {
        localStorage.setItem('nbg-theme', next);
      } catch (_) {}

      updateButton();
    });

    updateButton();
    document.body.append(toggle);
  });
})();
