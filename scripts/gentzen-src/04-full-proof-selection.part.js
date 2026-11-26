/* Proof Explorer 0.2: show a separately authored full derivation when supplied.
   Append AFTER the existing Proof Explorer add-on in assets/gentzen.js. */
(() => {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('proof-explorer')) return;

  function replaceWithFullProof() {
    const stage = document.querySelector('.proof-explorer-stage');
    // Direct entry has already placed the full derivation into the stage.
    if (stage?.querySelector(':scope > .explorerderivation')) return true;
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
    // The source-context marker lives on the sidebar version, because that
    // is what the reader opened.  Keep it when swapping in the complete tree.
    if (snippet.dataset.peContextId && !full.dataset.peContextId) {
      full.dataset.peContextId = snippet.dataset.peContextId;
    }
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



