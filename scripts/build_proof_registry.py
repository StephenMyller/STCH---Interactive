/* Proof Explorer 0.5 — registered unary-rule expansion.
   REPLACES the complete 0.4 expansion add-on; do not append alongside 0.4.
   Viewer 0.1, full-proof substitution 0.2, and proofExplorerPanBy stay unchanged.
   The rule data is generated from LaTeX into assets/proof-rules.json. */
(() => {
  'use strict';
  if (!new URLSearchParams(location.search).has('proof-explorer')) return;

  const LINK_PREFIX = '#proof-expand-rule-';
  const style = document.createElement('style');
  style.textContent = `
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"] { cursor: zoom-in; }
    .proof-explorer-stage svg a[href^="${LINK_PREFIX}"]:hover { opacity: .62; }
    .proof-explorer-expansion-note { font: inherit; font-size: .85rem; opacity: .85; }
    .proof-explorer-toolbar button:disabled { opacity: .4; cursor: default; }
  `;
  document.head.append(style);

  function braced(text, from) {
    let i = from;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== '{') return null;
    let depth = 0;
    const start = i + 1;
    for (; i < text.length; i++) {
      if (text[i] === '\\' && (text[i + 1] === '{' || text[i + 1] === '}')) {
        i++;
        continue;
      }
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        return {content: text.slice(start, i), end: i + 1};
      }
    }
    return null;
  }

  // Preserve command boundaries: stripping all spaces would merge "\exists B".
  // This deliberately does NOT parse arbitrary terms or expressions.
  const TOKEN = /\\[A-Za-z@]+|\\.|[A-Za-z](?:_\{?[0-9]+\}?)?|[0-9]+|\s+|[^\s]/g;
  const SIMPLE_VAR = /^[A-Za-z](?:_\{?[0-9]+\}?)?$/;
  function mathTokens(source) {
    const s = source.trim()
      .replace(/^\\\(\s*/, '').replace(/\s*\\\)$/, '')
      .replace(/^\$\s*/, '').replace(/\s*\$$/, '');
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

  function matchRule(rule, premise, conclusion) {
    const bindings = Object.create(null);
    if (!unify(rule.premise, premise, rule.vars, bindings)) return null;
    if (!unify(rule.conclusion, conclusion, rule.vars, bindings)) return null;
    return bindings;
  }

  function substituteFormula(formula, substitutions) {
    // Tokenwise replacement is essential: never replace letters inside \Set,
    // \exists, \operatorname, or an ordinary rule label.
    return formula.replace(TOKEN, token =>
      Object.prototype.hasOwnProperty.call(substitutions, token)
        ? substitutions[token] : token
    );
  }

  // Locate labeled inferences, checking their premises AND conclusions.
  // An application is never considered expandable merely because its label matches.
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
        label = {value: arg.content.trim(), start: match.index, command: name};
        continue;
      }
      if (name === 'AxiomC') {
        stack.push({formula: arg.content});
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
      const premises = stack.splice(-arity, arity);
      if (arity === 1 && label) {
        const rule = rules.find(item => item.label === label.value);
        const bindings = rule && matchRule(rule, premises[0].formula, arg.content);
        if (bindings) {
          hits.push({id: hits.length, rule, bindings,
            start: label.start, end: arg.end,
            originalConclusion: arg.content, labelCommand: label.command});
        }
      }
      stack.push({formula: arg.content});
      label = null;
    }
    return hits;
  }

  function markExpandableRules(source, rules) {
    const hits = findApplications(source, rules);
    let result = source;
    for (const hit of hits.slice().reverse()) {
      const marker = `\\${hit.labelCommand}{\\href{${LINK_PREFIX}${hit.id}}{${hit.rule.label}}}`;
      const old = result.slice(hit.start, hit.end);
      const prefix = new RegExp('^\\\\(?:RightLabel|RL)\\s*\\{[^{}]*\\}');
      const marked = old.replace(prefix, marker);
      if (marked === old) throw new Error(`Could not mark inference ${hit.rule.label}`);
      result = result.slice(0, hit.start) + marked + result.slice(hit.end);
    }
    return {tex: result, hits};
  }

  function expandOnce(source, id, rules) {
    const hit = findApplications(source, rules).find(item => item.id === id);
    if (!hit) return null;
    const substitutions = Object.assign(Object.create(null), hit.bindings);
    // Local bound variables must not capture free variables in the context.
    // Use genuinely fresh subscripted symbols, not a fixed name like Z.
    const used = new Set(mathTokens(source).filter(token => SIMPLE_VAR.test(token)));
    let next = 0;
    for (const local of hit.rule.fresh) {
      let candidate;
      do { candidate = `z_{${next++}}`; } while (used.has(candidate));
      used.add(candidate);
      substitutions[local] = candidate;
    }
    const replacement = hit.rule.steps.map((step, i) => {
      const conclusion = i === hit.rule.steps.length - 1
        ? hit.originalConclusion : substituteFormula(step.conclusion, substitutions);
      let tex = '';
      if (step.label) tex += `\\RightLabel{${step.label}}\n`;
      if (step.line === 'dashed') tex += '\\dashedLine\n';
      else if (step.line === 'none') tex += '\\noLine\n';
      else tex += '\\solidLine\n';
      tex += `\\UnaryInfC{${conclusion}}`;
      return tex;
    }).join('\n');
    return source.slice(0, hit.start) + replacement + source.slice(hit.end);
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

  function initialize(stage, item, rules) {
    const texEngine = window.MathJax;
    if (typeof texEngine?.tex2svgPromise !== 'function') {
      console.warn('Proof Explorer: MathJax SVG renderer unavailable.');
      return;
    }
    const toolbar = document.querySelector('.proof-explorer-toolbar');
    if (!toolbar) return;
    const fit = toolbar.querySelector('button[aria-label="Fit proof to window"]');
    let output = item.typesetRoot;
    let source = item.math;
    const history = [];
    let busy = false;

    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo expansion';
    undo.disabled = true;
    const hint = document.createElement('span');
    hint.className = 'proof-explorer-expansion-note';
    hint.setAttribute('role', 'status');
    toolbar.insertBefore(undo, fit || toolbar.firstChild);
    toolbar.insertBefore(hint, fit || toolbar.firstChild);

    async function render() {
      const prepared = markExpandableRules(source, rules);
      const replacement = await texEngine.tex2svgPromise(prepared.tex, {display: true});
      if (!replacement?.querySelector('svg') ||
          replacement.querySelector('merror, [data-mml-node="merror"]')) {
        throw new Error('MathJax failed to render the proof');
      }
      const oldBox = output.querySelector('svg')?.getBoundingClientRect();
      output.replaceWith(replacement);
      output = replacement;
      const newBox = replacement.querySelector('svg')?.getBoundingClientRect();
      if (oldBox && newBox && stage.proofExplorerPanBy) {
        stage.proofExplorerPanBy(
          (oldBox.left + oldBox.right - newBox.left - newBox.right) / 2,
          oldBox.bottom - newBox.bottom
        );
      }
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
          typeof replacement.animate === 'function') {
        replacement.animate([{opacity: .15}, {opacity: 1}],
          {duration: 200, easing: 'ease-out'});
      }
      hint.textContent = prepared.hits.length
        ? `Click a derived rule to expand it (${prepared.hits.length} available).`
        : history.length ? 'No further registered expansions in this tree.'
          : 'No registered expandable rules in this tree.';
      undo.disabled = history.length === 0;
    }

    async function change(next, revert = false) {
      if (busy) return;
      busy = true;
      const before = source;
      const previousHistory = history.slice();
      source = next;
      if (revert) history.pop();
      else history.push(before);
      try {
        await render();
      } catch (error) {
        source = before;
        history.splice(0, history.length, ...previousHistory);
        undo.disabled = history.length === 0;
        hint.textContent = 'Could not redraw the tree; original kept.';
        console.error('Proof Explorer expansion:', error);
      } finally {
        busy = false;
      }
    }

    stage.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      const href = link?.getAttribute('href');
      if (!href?.startsWith(LINK_PREFIX)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = Number(href.slice(LINK_PREFIX.length));
      if (!Number.isSafeInteger(id)) return;
      const next = expandOnce(source, id, rules);
      if (next) change(next);
    }, true);
    undo.addEventListener('click', () => {
      if (busy || !history.length) return;
      change(history[history.length - 1], true);
    });

    render().catch(error => {
      hint.textContent = 'Expansion is unavailable for this tree.';
      console.warn('Proof Explorer:', error);
    });
  }

  function start(rules) {
    const stage = document.querySelector('.proof-explorer-stage');
    if (!stage) return false;
    const snippet = stage.querySelector(':scope > .formalderivation');
    const key = snippet?.style.getPropertyValue('--explorer-id').trim();
    if (key && [...document.querySelectorAll('.explorerderivation')]
      .some(el => el.style.getPropertyValue('--explorer-id').trim() === key)) return false;
    const item = locateExplorerMath(stage);
    if (!item) return false;
    initialize(stage, item, rules);
    return true;
  }

  async function waitForExplorer() {
    const url = new URL('assets/proof-rules.json', location.href);
    let data;
    try {
      const response = await fetch(url, {cache: 'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
      if (data.version !== 1 || !data.rules) throw new Error('Unknown registry format');
    } catch (error) {
      console.warn('Proof Explorer: rule registry unavailable:', error);
      return;
    }
    const rules = Object.values(data.rules);
    if (start(rules)) return;
    const observer = new MutationObserver(() => {
      if (start(rules)) observer.disconnect();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    setTimeout(() => observer.disconnect(), 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForExplorer, {once: true});
  } else {
    waitForExplorer();
  }
})();
