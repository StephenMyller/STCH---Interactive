/* Standalone Proof Explorer entry points.
   If a full explorerderivation has no corresponding sidebar formalderivation,
   put an "Open in Proof Explorer" link in the manuscript immediately before
   the hidden full derivation. No new LaTeX commands or extra proof trees.
   The link uses the same full-window viewer as sidebar-launched proofs. */
(() => {
  'use strict';
  function installStandaloneExplorerLinks() {
    if (new URLSearchParams(location.search).has('proof-explorer')) return;
    const main = document.querySelector('main.bodycontainer');
    if (!main) return;

    const idOf = element =>
      element.style.getPropertyValue('--explorer-id').trim();
    const sidebarIds = new Set(
      [...document.querySelectorAll('.formalderivation')]
        .map(idOf).filter(Boolean)
    );
    const fullProofs = [...main.querySelectorAll('.explorerderivation')];
    const counts = new Map();
    for (const proof of fullProofs) {
      const id = idOf(proof);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }

    for (const proof of fullProofs) {
      const id = idOf(proof);
      // A sidebar proof already has its own Explorer entry point.
      // Unidentified or ambiguously identified proofs cannot be linked safely.
      if (!id || sidebarIds.has(id) || counts.get(id) !== 1 ||
          proof.dataset.directExplorerLauncher === 'true') continue;

      const url = new URL(location.href);
      url.searchParams.set('proof-explorer', id);
      // Return to the result, rather than the top of the chapter, if possible.
      url.hash = document.getElementById(id) ? id : '';

      const trigger = document.createElement('div');
      trigger.className = 'derivation-trigger';
      const link = document.createElement('a');
      link.className = 'proof-explorer-launch';
      link.textContent = 'Open in Proof Explorer';
      link.title = 'Explore the complete Gentzen derivation';
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener';
      trigger.append(link);
      proof.before(trigger);
      proof.dataset.directExplorerLauncher = 'true';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installStandaloneExplorerLinks,
      {once: true});
  } else {
    installStandaloneExplorerLinks();
  }
})();
