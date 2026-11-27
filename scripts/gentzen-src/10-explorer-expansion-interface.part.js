  function locateExplorerMath(stage) {
    const math = window.MathJax?.startup?.document?.math;
    if (!math) return null;
    for (const item of math) {
      if (item.typesetRoot && stage.contains(item.typesetRoot) &&
          /\\begin\s*\{prooftree\}/.test(item.math)) return item;
    }
    return null;
  }

  function initialize(stage, item, rules, propositions, dependencies = {}, registryIssue = '') {
    const texEngine = window.MathJax;
    if (typeof texEngine?.tex2svgPromise !== 'function') {
      throw new Error('MathJax SVG renderer unavailable');
    }
    const toolbar = document.querySelector('.proof-explorer-toolbar');
    if (!toolbar) return;
    const fit = toolbar.querySelector('button[aria-label="Fit proof to window"]');
    let output = item.typesetRoot;
    let source = item.math;
    const initialSource = source; // Immutable: the mathematical dependency view is not expansion-dependent.
    const history = [];
    const origins = [];  // provenance links, one per expansion
    const originSnapshots = []; // allow undoing Contract All and bulk operations exactly
    let busy = false;
    let bulkBusy = false;

    const undo = document.createElement('button');
    undo.type = 'button';
    undo.textContent = 'Undo expansion';
    undo.disabled = true;
    const hint = document.createElement('span');
    hint.className = 'proof-explorer-expansion-note';
    hint.setAttribute('role', 'status');
    const provenance = document.createElement('span');
    provenance.className = 'proof-explorer-provenance';
    // The original viewer supplies zoom controls and textbook navigation.
    // Move these existing controls rather than duplicating their event handlers.
    const heading = toolbar.querySelector('.proof-explorer-title');
    const back = toolbar.querySelector('a[href]');
    const minus = toolbar.querySelector('button[aria-label="Zoom out"]');
    const plus = toolbar.querySelector('button[aria-label="Zoom in"]');
    const makeButton = (name, text) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', name);
      return b;
    };
    const expandAll = makeButton('Expand all rules', 'Expand all');
    const contractAll = makeButton('Contract all rules', 'Contract all');
    const depsToggle = makeButton('Toggle theorem dependencies', 'Dependencies');
    depsToggle.setAttribute('aria-expanded', 'false');
    const count = document.createElement('span');
    count.className = 'pe-expanded-count';

    // Display the *authored result*, not the last proposition unfolded inside
    // its proof.  The source marker survives moving to the sidebar and swapping
    // to explorerderivation; registry metadata supplies its full, stable name.
    function currentResultName() {
      const proof = stage.querySelector(':scope > .explorerderivation, :scope > .formalderivation');
      const rawId = proof?.style.getPropertyValue('--explorer-id').trim();
      const contextId = proof?.dataset.peContextId;
      const index = dependencies?.results || {};
      const ids = [contextId, rawId].filter(Boolean);
      if (rawId && !rawId.includes(':')) {
        ids.push('prop:' + rawId, 'thm:' + rawId, 'lem:' + rawId, 'cor:' + rawId);
      }
      for (const id of ids) {
        const result = index[id];
        if (!result || result.kind === 'axiom') continue;
        const reference = String(result.reference || result.number || '').trim();
        const name = String(result.title || '').trim();
        if (reference && name && reference !== name) return reference + ' — ' + name;
        if (name || reference) return name || reference;
      }
      // A rule justification is also a legitimate standalone derivation.
      // Do not misidentify it as a theorem just because another theorem was
      // cited within the rule's proof.
      const ruleId = ids.find(id => id.startsWith('rule:'));
      if (ruleId) {
        const registered = rules.find(rule => rule.id === ruleId);
        const name = registered?.label?.replace(/\\\(|\\\)/g, '').trim() ||
          ruleId.slice('rule:'.length).replace(/-/g, ' ');
        return 'Derived Rule — ' + name;
      }
      return '';
    }

    const head = document.createElement('div'); head.className = 'pe-toolbar-head';
    const title = document.createElement('div'); title.className = 'pe-toolbar-title-block';
    const mainline = document.createElement('div'); mainline.className = 'pe-toolbar-mainline';
    if (heading) mainline.append(heading, count);
    title.append(mainline);
    const resultName = currentResultName();
    if (resultName) {
      const subtitle = document.createElement('div');
      subtitle.className = 'pe-current-result';
      subtitle.textContent = resultName;
      title.append(subtitle);
    }
    head.append(title);
    if (back) head.append(back);
    const actions = document.createElement('div'); actions.className = 'pe-toolbar-actions';
    const expansionGroup = document.createElement('div'); expansionGroup.className = 'pe-toolbar-action-group';
    expansionGroup.append(expandAll, contractAll, undo);
    const navigationGroup = document.createElement('div'); navigationGroup.className = 'pe-toolbar-action-group';
    if (minus) navigationGroup.append(minus);
    if (plus) navigationGroup.append(plus);
    if (fit) navigationGroup.append(fit);
    navigationGroup.append(depsToggle);
    actions.append(expansionGroup, navigationGroup);
    const statusRow = document.createElement('div'); statusRow.className = 'pe-toolbar-status';
    statusRow.append(hint, provenance);
    toolbar.replaceChildren(head, actions, statusRow);

    // The side panel does not observe visual proof expansions. Its inputs are
    // the original authored proof and build-time result metadata, exclusively.
    const overlay = toolbar.closest('.proof-explorer-overlay');
    const viewport = overlay?.querySelector('.proof-explorer-viewport');
    const workspace = document.createElement('div'); workspace.className = 'pe-workspace';
    const sidebar = document.createElement('aside'); sidebar.className = 'pe-dependency-panel';
    sidebar.setAttribute('aria-label', 'Theorem and axiom dependencies');
    sidebar.hidden = true;
    if (viewport && overlay) {
      overlay.insertBefore(workspace, viewport);
      workspace.append(viewport, sidebar);
    }
    // The dependency graph is built from authored proofs at publication time.
    // This view takes a snapshot of the original proof; it never observes
    // expansion/contract state. Derived rules are transparent graph edges.
    const dependencyIndex = dependencies?.results || {};
    const axiomLookup = dependencies?.axioms || {};
    const dependencyRules = dependencies?.rules || {};
    const dependencyRuleLabels = dependencies?.ruleLabels || {};
    // Axiom labels and their short rule names resolve to exactly the same
    // result. Their textual names live in the generated registry.
    const axiomAliases = new Map(Object.entries(axiomLookup)
      .filter(([, entry]) => entry?.shortName)
      .map(([number, entry]) => [entry.shortName, number]));
    const depCategoryOrder = id => id.startsWith('axiom:number:') ||
      dependencyIndex[id]?.kind === 'axiom' ? 0 : id.startsWith('rule:') ? 2 : 1;
    function dependencySort(ids) {
      return [...new Set(ids)].sort((a, b) =>
        depCategoryOrder(a) - depCategoryOrder(b) || a.localeCompare(b));
    }
    function dependencyBaseLabel(raw) {
      const withoutMath = normalizeRuleLabel(raw || '');
      return withoutMath.replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\(?:operatorname|text)\s*\{([^{}]*)\}/g, '$1')
        .replace(/\\mathrm(?=[A-Za-z])/g, '')
        .split(',')[0];
    }
    const DEP_PURE_LOGIC = /^(?:\\(?:forall|exists|land|lor|leftrightarrow|to|neg|bot|top|equiv)(?:_S)?(?:-[IE]\*?)?|=-(?:I|E)|CR|RAA|Eqv-Rep)$/;
    function extractDependencies(tex) {
      const direct = new Set();
      const issues = new Set();
      const command = /\\(?:RightLabel|RL)\b/g;
      let match;
      while ((match = command.exec(tex))) {
        const arg = braced(tex, command.lastIndex);
        if (!arg) { issues.add('Could not read a proof inference label'); break; }
        command.lastIndex = arg.end;
        const raw = arg.content;
        // Lwarp's resolved references have the form
        // \href{Chapter.html#prop:foo}{1.2}; use the stable anchor, not the
        // displayed number, which may change between editions.
        const href = /\\href\s*\{[^{}]*?#((?:ax|axiom|prop|th|thm|lem|lemma|cor|meta):[^{}#]+)\}\s*\{[^{}]*\}/g;
        let link;
        let cited = false;
        while ((link = href.exec(raw))) { direct.add(link[1]); cited = true; }
        const ref = /\\ref\s*\{((?:ax|axiom|prop|th|thm|lem|lemma|cor|meta):[^{}]+)\}/g;
        while ((link = ref.exec(raw))) { direct.add(link[1]); cited = true; }
        if (cited) continue;
        const base = dependencyBaseLabel(raw);
        if (!base || /^[1-9]\d*$/.test(base) || /^[a-z]$/.test(base)) continue;
        const axiom = /^A_?\{?(\d+)\}?$/.exec(base);
        if (axiom) { direct.add('axiom:number:' + axiom[1]); continue; }
        if (axiomAliases.has(base)) {
          direct.add('axiom:number:' + axiomAliases.get(base)); continue;
        }
        const transparent = dependencyRuleLabels[base];
        if (transparent?.length) { transparent.forEach(id => direct.add(id)); continue; }
        if (base === 'Def.' || base === 'Def' || base === 'Definition' || base.startsWith('D')) continue;
        if (DEP_PURE_LOGIC.test(base)) continue;
        issues.add('Unindexed inference rule: ' + base);
      }
      return {direct: dependencySort(direct), issues: [...issues]};
    }
    const authoredDependencies = extractDependencies(initialSource);
    // A missing registry must be visible as an unresolved dependency path,
    // never misreported as a proof using no axioms.
    if (registryIssue) authoredDependencies.issues.push(registryIssue);
    const immediateDependencies = authoredDependencies.direct;
    const dependencyRoots = dependencySort(immediateDependencies);

    function dependencyRecord(id) {
      if (id.startsWith('axiom:number:')) {
        const number = id.slice('axiom:number:'.length);
        const axiom = axiomLookup[number];
        return {id, kind: 'axiom', number: 'A' + number,
          reference: axiom?.reference || 'A' + number,
          title: axiom?.title || '', url: axiom?.url || null,
          requires: [], issues: axiom ? [] : ['Unknown axiom reference A' + number]};
      }
      if (id.startsWith('rule:')) {
        const record = dependencyRules[id];
        return record ? {...record, kind: 'rule'} :
          {id, kind: 'rule', requires: [], issues: ['Unindexed derived rule: ' + id]};
      }
      const record = dependencyIndex[id];
      if (record?.kind === 'axiom') {
        const knownNumber = Object.entries(axiomLookup)
          .find(([, entry]) => entry.id === id)?.[0];
        return {...record, number: knownNumber ? 'A' + knownNumber : record.number,
          reference: knownNumber ? 'A' + knownNumber : (record.reference || record.number),
          requires: [], issues: []};
      }
      return record || {id, kind: 'missing', title: id, requires: [],
        issues: ['Unindexed mathematical result: ' + id]};
    }
    function traceDependencies() {
      const foundations = new Map();
      const problems = new Set(authoredDependencies.issues);
      const observed = new Set();
      function visit(id, stack) {
        const node = dependencyRecord(id);
        if (stack.has(id)) { problems.add('Cyclic dependency involving ' + id); return; }
        if (node.kind === 'axiom') {
          foundations.set(node.number, node);
          // The axiom is still a foundational dependency even if its source
          // cannot be linked: make the missing source visible.
          for (const issue of node.issues || []) problems.add(issue);
          return;
        }
        for (const issue of node.issues || []) problems.add(issue);
        if (observed.has(id)) return;
        observed.add(id);
        const next = new Set(stack); next.add(id);
        for (const child of node.requires || []) visit(child, next);
      }
      dependencyRoots.forEach(id => visit(id, new Set()));
      return {foundations: [...foundations.values()].sort((a, b) =>
          Number(a.number.slice(1)) - Number(b.number.slice(1))),
        problems: [...problems].sort()};
    }
    const dependencyTrace = traceDependencies();

    const subscripts = '₀₁₂₃₄₅₆₇₈₉';
    function dependencyReference(node) {
      let raw = String(node.reference || node.number || '').trim();
      if (!raw) return '';
      if (node.kind === 'axiom') {
        const match = /^A_?\{?(\d+)\}?$/.exec(raw);
        return match ? 'A' + [...match[1]].map(digit => subscripts[Number(digit)]).join('') : raw;
      }
      const prefix = {proposition:'P', theorem:'T', lemma:'L',
        corollary:'C', metatheorem:'M'}[node.kind] || '';
      return prefix && /^\d/.test(raw) ? prefix + raw : raw;
    }
    function dependencyDisplayName(node) {
      const reference = dependencyReference(node);
      const title = String(node.title || '').trim();
      return reference && title && reference !== title ? reference + ' — ' + title :
        reference || title || node.id;
    }

    function dependencyLink(node, text) {
      if (!node.url) return document.createTextNode(text);
      const link = document.createElement('a');
      link.href = node.url; link.textContent = text;
      link.title = 'Open result in textbook';
      return link;
    }
    function hasVisibleDependency(id, stack = new Set()) {
      if (stack.has(id)) return true; // a cycle is itself a visible warning
      const node = dependencyRecord(id);
      if (node.kind !== 'rule' || (node.issues || []).length) return true;
      const next = new Set(stack); next.add(id);
      return (node.requires || []).some(child => hasVisibleDependency(child, next));
    }
    function visibleDependencies(ids) {
      return dependencySort(ids).filter(id => hasVisibleDependency(id));
    }
    function renderDependencyBranch(id, ancestors = new Set(), depth = 0) {
      const node = dependencyRecord(id);
      const fragment = document.createDocumentFragment();
      if (node.kind === 'rule') {
        // A rule justifies a step but does not become its own result node.
        if (ancestors.has(id)) {
          const message = document.createElement('li');
          message.className = 'pe-dependency-warning';
          message.textContent = 'Cyclic rule reference: ' + id;
          fragment.append(message); return fragment;
        }
        const next = new Set(ancestors); next.add(id);
        for (const child of visibleDependencies(node.requires || [])) {
          fragment.append(renderDependencyBranch(child, next, depth));
        }
        for (const issue of node.issues || []) {
          const warning = document.createElement('li');
          warning.className = 'pe-dependency-warning';
          warning.textContent = issue; fragment.append(warning);
        }
        return fragment;
      }
      const li = document.createElement('li');
      const label = dependencyDisplayName(node);
      const children = visibleDependencies(node.requires || []);
      if (ancestors.has(id)) {
        li.textContent = label + ' (cycle)';
        li.className = 'pe-dependency-warning';
      } else if (children.length || (node.issues || []).length) {
        const details = document.createElement('details');
        details.open = depth < 2;
        const summary = document.createElement('summary');
        summary.append(dependencyLink(node, label));
        details.append(summary);
        const sublist = document.createElement('ul');
        const next = new Set(ancestors); next.add(id);
        for (const child of children) sublist.append(renderDependencyBranch(child, next, depth + 1));
        for (const issue of node.issues || []) {
          const warning = document.createElement('li');
          warning.className = 'pe-dependency-warning';
          warning.textContent = issue; sublist.append(warning);
        }
        details.append(sublist);
        li.append(details);
      } else {
        li.append(dependencyLink(node, label));
        li.className = node.kind === 'axiom' ? 'pe-dependency-axiom' : '';
      }
      fragment.append(li); return fragment;
    }

    function renderDependencies() {
      sidebar.replaceChildren();
      const header = document.createElement('div');
      header.className = 'pe-dependency-heading';
      const title = document.createElement('h2'); title.textContent = 'Axiomatic Foundations';
      const help = document.createElement('details');
      help.className = 'pe-dependency-help';
      const helpToggle = document.createElement('summary');
      helpToggle.textContent = '?'; helpToggle.title = 'About dependency tracking';
      helpToggle.setAttribute('aria-label', 'About dependency tracking');
      const explanation = document.createElement('p');
      explanation.textContent = 'Axioms used by this authored proof, including through earlier results. ' +
        'Definitions and logical rules are omitted. These are the axioms used by the chosen proof, ' +
        'not necessarily the fewest axioms from which the theorem can be proved.';
      help.append(helpToggle, explanation);
      header.append(title, help); sidebar.append(header);
      const summary = document.createElement('div');
      summary.className = 'pe-foundations';
      if (dependencyTrace.foundations.length) {
        for (const axiom of dependencyTrace.foundations) {
          const chip = document.createElement('span');
          chip.className = 'pe-foundation-axiom';
          chip.append(dependencyLink(axiom, dependencyDisplayName(axiom)));
          chip.title = axiom.title || dependencyReference(axiom);
          summary.append(chip);
        }
      } else {
        const empty = document.createElement('p');
        empty.className = 'pe-dependency-empty';
        empty.textContent = 'No axioms identified in the indexed dependency paths.';
        summary.append(empty);
      }
      sidebar.append(summary);
      if (dependencyTrace.problems.length) {
        const coverage = document.createElement('p');
        coverage.className = 'pe-dependency-coverage';
        coverage.textContent = 'Partially traced — ' + dependencyTrace.problems.length +
          ' unresolved ' + (dependencyTrace.problems.length === 1 ? 'path' : 'paths');
        sidebar.append(coverage);
      }
      const hierarchyTitle = document.createElement('h3');
      hierarchyTitle.textContent = 'Dependency Hierarchy';
      sidebar.append(hierarchyTitle);
      const list = document.createElement('ul'); list.className = 'pe-dependency-tree';
      visibleDependencies(dependencyRoots).forEach(id => list.append(renderDependencyBranch(id)));
      if (list.children.length) sidebar.append(list);
      else {
        const empty = document.createElement('p');
        empty.className = 'pe-dependency-empty';
        empty.textContent = 'No cited axioms or prior results found in this proof.';
        sidebar.append(empty);
      }
      if (dependencyTrace.problems.length) {
        const details = document.createElement('details');
        details.className = 'pe-dependency-problems';
        const summary = document.createElement('summary');
        summary.textContent = 'Unresolved Paths (' + dependencyTrace.problems.length + ')';
        details.append(summary);
        const list = document.createElement('ul');
        for (const problem of dependencyTrace.problems) {
          const li = document.createElement('li'); li.textContent = problem;
          list.append(li);
        }
        details.append(list); sidebar.append(details);
      }
    }
    renderDependencies();
    depsToggle.addEventListener('click', () => {
      sidebar.hidden = !sidebar.hidden;
      depsToggle.setAttribute('aria-expanded', String(!sidebar.hidden));
      // The proof should stay at its existing scale and may be panned as usual.
      stage.proofExplorerCenterIfFits?.();
      stage.proofExplorerSyncLines?.();
    });

    function showProvenance() {
      provenance.replaceChildren();
      const refs = origins.flatMap(value =>
        Array.isArray(value) ? value : value ? [value] : []);
      if (!refs.length) return;
      provenance.append(document.createTextNode('Expanded from: '));
      refs.slice(-8).forEach((ref, i) => {
        if (i) provenance.append(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.href = ref.url;
        link.textContent = `P${ref.number}`;
        link.title = 'Open the original proposition in the textbook';
        provenance.append(link);
      });
      if (refs.length > 8) provenance.append(document.createTextNode(` · +${refs.length - 8} earlier`));
    }

    // Lay out the entire inference subtree, not only the width of its last
    // formula.  MathJax bussproofs can overlap branches with deep descendants.
    const fragmentCache = new Map();
    function parseLayoutTree(tex) {
      const nodes = []; let label = '', leftLabel = '', line = 'solid';
      const arity = {UnaryInfC:1,BinaryInfC:2,TrinaryInfC:3,QuaternaryInfC:4,QuinaryInfC:5};
      const commands = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL|LeftLabel|LL|noLine|dashedLine|solidLine|singleLine|alwaysNoLine|alwaysDashedLine|alwaysSolidLine|alwaysSingleLine)\b/g;
      let m;
      while ((m = commands.exec(tex))) {
        const name = m[1];
        if (name==='noLine'||name==='alwaysNoLine') {line='none';continue;}
        if (/^(always)?DashedLine$/.test(name) || name==='dashedLine') {line='dashed';continue;}
        if (/^(always)?SolidLine$/.test(name) || name==='solidLine' || name==='singleLine' || name==='alwaysSingleLine') {line='solid';continue;}
        const arg = braced(tex,commands.lastIndex);
        if (!arg) throw new Error('Malformed proof-tree argument: '+name);
        commands.lastIndex=arg.end;
        if (name==='RightLabel'||name==='RL') {label=arg.content;continue;}
        if (name==='LeftLabel'||name==='LL') {leftLabel=arg.content;continue;}
        if (name==='AxiomC') {
          nodes.push({formula:arg.content,children:[],leaf:true});label=leftLabel='';continue;
        }
        const n=arity[name];
        if (!n||nodes.length<n) throw new Error('Disconnected or malformed proof tree');
        nodes.push({formula:arg.content,children:nodes.splice(-n,n),leaf:false,
                    label,leftLabel,line});label=leftLabel='';line='solid';
      }
      if (nodes.length!==1) throw new Error('Malformed proof tree: '+nodes.length+' roots');
      return nodes[0];
    }
    function fragmentTex(raw) {
      return raw.trim().replace(/\\\(|\\\)|\\\[|\\\]/g,'').replace(/\$/g,'');
    }
    async function proofMath(raw) {
      const tex=fragmentTex(raw);
      if (!tex) return document.createElement('span');
      let ready=fragmentCache.get(tex);
      if (!ready) {
        ready=texEngine.tex2svgPromise(tex,{display:false}).then(el=>{
          if (!el.querySelector('svg')||el.querySelector('merror,[data-mml-node="merror"]'))
            throw new Error('Proof math failed: '+tex);
          return el;
        });
        fragmentCache.set(tex,ready);
      }
      return (await ready).cloneNode(true);
    }
    // A bussproofs RightLabel is ordinary mixed-mode text, not one formula.
    // e.g. "\\(\\to\\)-I, 2" has a mathematical arrow but roman "-I, 2".
    // The previous custom renderer removed math delimiters and sent the WHOLE
    // label to MathJax, wrongly italicizing the text and ignoring scriptsize.
    // Parse only genuine math segments as TeX; preserve text and hyperlink
    // segments (including the Explorer's separate expandable rule controls).
    async function proofLabel(raw) {
      const result = document.createDocumentFragment();
      const source = raw.trim();
      let plain = '';
      const flush = () => {
        if (plain) { result.append(document.createTextNode(plain)); plain = ''; }
      };
      for (let i = 0; i < source.length;) {
        const mathOpen = source.startsWith('\\(', i) ? ['\\)', 2]
          : source.startsWith('\\[', i) ? ['\\]', 2]
          : source[i] === '$' && source[i-1] !== '\\' ? ['$', 1] : null;
        if (mathOpen) {
          const [close, openLength] = mathOpen;
          const end = source.indexOf(close, i + openLength);
          if (end !== -1) {
            flush();
            const content = source.slice(i + openLength, end);
            result.append(await proofMath(content));
            i = end + close.length;
            continue;
          }
        }
        if (source.startsWith('\\href', i) && !/[A-Za-z]/.test(source[i+5] || '')) {
          const destination = braced(source, i + 5);
          const linkText = destination && braced(source, destination.end);
          if (linkText) {
            flush();
            const anchor = document.createElement('a');
            anchor.setAttribute('href', destination.content);
            anchor.append(await proofLabel(linkText.content));
            result.append(anchor);
            i = linkText.end;
            continue;
          }
        }
        // Explicit font-size commands in a label have the same meaning as
        // the renderer's scriptsize styling; never print them as plain text.
        const fontCommand = /^\\(?:scriptsize|tiny|footnotesize|normalsize)\b/.exec(source.slice(i));
        if (fontCommand) { flush(); i += fontCommand[0].length; continue; }
        // Un-delimited TeX commands used inside a label are rare, but still
        // allow them to be typeset instead of exposing backslash text.
        const bareCommand = /^\\(?:mathrm|mathsf|textbf|mathbf|operatorname)\b/.exec(source.slice(i));
        if (bareCommand) {
          const argument = braced(source, i + bareCommand[0].length);
          if (argument) {
            flush();
            result.append(await proofMath(source.slice(i, argument.end)));
            i = argument.end;
            continue;
          }
        }
        plain += source[i++];
      }
      flush();
      return result;
    }

    async function proofBranch(node) {
      const container=document.createElement('span');
      container.className='pe-node'+(node.leaf?' pe-leaf':'');
      if (node.children.length) {
        const premises=document.createElement('span');premises.className='pe-premises';
        for (const child of node.children) premises.append(await proofBranch(child));
        container.append(premises);
      }
      const conclusion=document.createElement('span');conclusion.className='pe-conclusion';
      if (node.formula.trim()) conclusion.append(await proofMath(node.formula));
      if (node.leaf) container.append(conclusion);
      else {
        const step=document.createElement('span');step.className='pe-step';
        const row=document.createElement('span');row.className='pe-rule-row';
        if (node.leftLabel) {
          const l=document.createElement('span');l.className='pe-label pe-left-label';
          l.append(await proofLabel(node.leftLabel));row.append(l);
        }
        const bar=document.createElement('span');bar.className='pe-bar pe-'+node.line;
        row.append(bar);
        if (node.label) {
          const l=document.createElement('span');l.className='pe-label pe-right-label';
          l.append(await proofLabel(node.label));row.append(l);
        }
        step.append(row,conclusion);container.append(step);
      }
      return container;
    }
    async function drawProof(markedSource) {
      const outer=document.createElement('span');outer.className='pe-tree';
      outer.append(await proofBranch(parseLayoutTree(markedSource)));
      return outer;
    }

    // The proof's *layout box* must reserve enough space for a right-hand
    // inference label to sit outside the immediately adjacent formulas.
    // First reserve only the missing side clearance, bottom-up. The premises
    // stay in their normal nested layout; we do not translate formulas or
    // reparent branches. Then trim the painted lines independently.
    function inferenceLayoutAnchors(node) {
      const premises = [...node.children].find(el => el.classList.contains('pe-premises'));
      const step = [...node.children].find(el => el.classList.contains('pe-step'));
      if (!premises || !step) return null;
      const row = step.querySelector(':scope > .pe-rule-row');
      const conclusion = step.querySelector(':scope > .pe-conclusion');
      const bar = row?.querySelector(':scope > .pe-bar');
      if (!row || !conclusion || !bar) return null;
      const anchors = [conclusion];
      for (const child of premises.children) {
        const childStep = [...child.children].find(el => el.classList.contains('pe-step'));
        const childConclusion = childStep
          ? childStep.querySelector(':scope > .pe-conclusion')
          : [...child.children].find(el => el.classList.contains('pe-conclusion'));
        if (childConclusion) anchors.push(childConclusion);
      }
      return {row, step, bar, anchors};
    }

    function inferenceLineMetrics(layout) {
      const {row, anchors} = layout;
      const rowRect = row.getBoundingClientRect();
      if (!rowRect.width || !row.offsetWidth) return null;
      const scale = rowRect.width / row.offsetWidth;
      const toX = x => (x - rowRect.left) / scale;
      const fontSize = parseFloat(getComputedStyle(row).fontSize) || 16;
      // The first margin is visible inference line beyond the formulas;
      // the second is the gap from its endpoint to the printed rule label.
      const padding = fontSize * .60;
      const gap = fontSize * .35;
      const minimum = fontSize * 1.25;
      const rectangles = anchors.map(el => el.getBoundingClientRect())
        .filter(rect => rect.width > 1 && rect.height > 0);
      if (!rectangles.length) return null;
      const naturalLeft = Math.min(...rectangles.map(rect => toX(rect.left))) - padding;
      const naturalRight = Math.max(...rectangles.map(rect => toX(rect.right))) + padding;
      const leftLabel = row.querySelector(':scope > .pe-left-label');
      const rightLabel = row.querySelector(':scope > .pe-right-label');
      const leftWidth = leftLabel ? leftLabel.getBoundingClientRect().width / scale : 0;
      const rightWidth = rightLabel ? rightLabel.getBoundingClientRect().width / scale : 0;
      const parentNode = row.closest('.pe-node');
      const reservedLeft = parseFloat(parentNode?.style.paddingLeft) || 0;
      const reservedRight = parseFloat(parentNode?.style.paddingRight) || 0;
      const lower = (leftLabel ? leftWidth + gap : 0) - reservedLeft;
      const upper = row.offsetWidth + reservedRight - (rightLabel ? rightWidth + gap : 0);
      return {row, scale, toX, naturalLeft, naturalRight, minimum,
              gap, leftLabel, rightLabel, leftWidth, lower, upper};
    }

    function trimInferenceLines(tree) {
      const nodes = [...tree.querySelectorAll('.pe-node:not(.pe-leaf)')];
      // Reserve the smallest needed right/left overhang as side padding on the
      // whole subtree. That keeps the internal premise positions unchanged
      // while sibling branches still account for the extra occupied width.
      // Reading nodes in reverse makes child widths stable before parents.
      for (const node of nodes.reverse()) {
        const layout = inferenceLayoutAnchors(node);
        if (!layout) continue;
        const measured = inferenceLineMetrics(layout);
        if (!measured) continue;
        const {naturalLeft, naturalRight, lower, upper} = measured;
        const shortfallRight = Math.max(0, naturalRight - upper);
        const shortfallLeft = Math.max(0, lower - naturalLeft);
        if (shortfallRight > .5) node.style.paddingRight = `${Math.ceil(shortfallRight + 2)}px`;
        if (shortfallLeft > .5) node.style.paddingLeft = `${Math.ceil(shortfallLeft + 2)}px`;
      }
      // The reserved layout is now stable; move only the visible line ends
      // and labels, never the premises or conclusions.
      for (const node of nodes) {
        const layout = inferenceLayoutAnchors(node);
        if (!layout) continue;
        const measured = inferenceLineMetrics(layout);
        if (!measured) continue;
        const {row, scale, toX, naturalLeft, naturalRight, minimum,
               gap, leftLabel, rightLabel, leftWidth, lower, upper} = measured;
        const room = upper - lower;
        if (room <= 0) continue;
        const required = Math.min(minimum, room);
        const left = Math.max(lower, Math.min(naturalLeft, upper - required));
        const right = Math.min(upper, Math.max(naturalRight, left + required));

        layout.bar.style.setProperty('--pe-line-left', `${left}px`);
        layout.bar.style.setProperty('--pe-line-width', `${right - left}px`);
        if (leftLabel) {
          const originalLeft = toX(leftLabel.getBoundingClientRect().left);
          leftLabel.style.transform = `translateX(${left - gap - leftWidth - originalLeft}px)`;
        }
        if (rightLabel) {
          const originalLeft = toX(rightLabel.getBoundingClientRect().left);
          rightLabel.style.transform = `translateX(${right + gap - originalLeft}px)`;
        }
      }
    }

    async function render() {
      const prepared = markExpandableRules(source, rules, propositions);
      let replacement;
      try {
        replacement = await drawProof(prepared.tex);
      } catch (layoutError) {
        // Retain the earlier renderer for an unsupported proof-tree command.
        console.warn('Proof Explorer: full-subtree layout unavailable; using MathJax', layoutError);
        replacement = await texEngine.tex2svgPromise(prepared.tex, {display: true});
      }
      const oldBox = output.getBoundingClientRect();
      output.replaceWith(replacement);
      output = replacement;
      if (replacement.classList.contains('pe-tree')) trimInferenceLines(replacement);
      // Update viewport-level inference strokes from their freshly trimmed geometry.
      // The SVG stays outside the scaled stage throughout all zoom and pan events.
      stage.proofExplorerSyncLines?.();
      const newBox = replacement.getBoundingClientRect();
      if (oldBox && newBox && stage.proofExplorerPanBy) {
        stage.proofExplorerPanBy(
          (oldBox.left + oldBox.right - newBox.left - newBox.right) / 2,
          oldBox.bottom - newBox.bottom
        );
      }
      stage.proofExplorerCenterIfFits?.();
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
          typeof replacement.animate === 'function') {
        replacement.animate([{opacity: .15}, {opacity: 1}],
          {duration: 200, easing: 'ease-out'});
      }
      hint.textContent = registryIssue || (prepared.hits.length
        ? `Click ⊕ beside a derived rule or proposition to expand (${prepared.hits.length} available).`
        : history.length ? 'No further registered expansions in this tree.'
          : 'No registered expandable rules in this tree.');
      undo.disabled = history.length === 0;
      expandAll.disabled = prepared.hits.length === 0;
      contractAll.disabled = source === initialSource;
      count.textContent = `${history.length} action${history.length === 1 ? '' : 's'}`;
      showProvenance();
    }

    async function change(next, revert = false, origin = null, resetOrigins = false) {
      if (busy) return;
      busy = true;
      const before = source;
      const previousHistory = history.slice();
      const previousOrigins = origins.slice();
      const previousOriginSnapshots = originSnapshots.map(snapshot => snapshot.slice());
      source = next;
      if (revert) {
        history.pop();
        origins.splice(0, origins.length, ...(originSnapshots.pop() || []));
      } else {
        history.push(before);
        originSnapshots.push(previousOrigins);
        if (resetOrigins) origins.splice(0);
        else origins.push(origin);
      }
      try {
        await render();
      } catch (error) {
        source = before;
        history.splice(0, history.length, ...previousHistory);
        origins.splice(0, origins.length, ...previousOrigins);
        originSnapshots.splice(0, originSnapshots.length, ...previousOriginSnapshots);
        undo.disabled = history.length === 0;
        hint.textContent = 'Could not redraw the tree; original kept.';
        console.error('Proof Explorer expansion:', error);
      } finally {
        busy = false;
      }
    }

    // Expand All is recursive: newly revealed rules are eligible immediately.
    // Commit as ONE history action and redraw only when the batch finishes.
    // Bounded work avoids locking a browser on a very large textbook proof.
    expandAll.addEventListener('click', async () => {
      if (busy || bulkBusy) return;
      bulkBusy = true;
      expandAll.disabled = contractAll.disabled = undo.disabled = true;
      let next = source;
      let expanded = 0;
      const acquired = [];
      const MAX_STEPS = 150;
      const MAX_SOURCE_LENGTH = 1000000;
      try {
        while (expanded < MAX_STEPS && next.length < MAX_SOURCE_LENGTH) {
          const candidates = allApplications(next, rules, propositions);
          if (!candidates.length) break;
          let replacement = null;
          for (const candidate of candidates.slice().reverse()) {
            try {
              const proposed = expandWithForwarding(next, candidate.id, rules, propositions);
              if (proposed && proposed.source !== next) {
                replacement = proposed; break;
              }
            } catch (error) {
              console.warn('Skipping unavailable expansion:', error);
            }
          }
          if (!replacement) break;
          next = replacement.source;
          acquired.push(...replacement.origins);
          expanded++;
          if (expanded % 8 === 0) {
            hint.textContent = `Expanding… ${expanded} inferences`;
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
        }
        if (next !== source) await change(next, false, acquired);
        if (expanded >= MAX_STEPS || next.length >= MAX_SOURCE_LENGTH) {
          hint.textContent = `Expanded ${expanded} inferences; safety limit reached. Expand all again to continue.`;
        }
      } catch (error) {
        console.error('Expand All:', error);
        hint.textContent = 'Expand All could not finish. The previous proof is unchanged.';
      } finally {
        bulkBusy = false;
        undo.disabled = history.length === 0;
        contractAll.disabled = source === initialSource;
        expandAll.disabled = allApplications(source, rules, propositions).length === 0;
      }
    });
    contractAll.addEventListener('click', () => {
      if (busy || bulkBusy || source === initialSource) return;
      change(initialSource, false, null, true);
    });

    stage.addEventListener('click', event => {
      if (busy || bulkBusy) return;
      const link = event.target.closest?.('a[href]');
      const href = link?.getAttribute('href');
      const prefix = href?.startsWith(LINK_PREFIX) ? LINK_PREFIX
        : href?.startsWith(PROP_LINK_PREFIX) ? PROP_LINK_PREFIX : null;
      if (!prefix) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = Number(href.slice(prefix.length));
      if (!Number.isSafeInteger(id)) return;
      try {
        const expansion = expandWithForwarding(source, id, rules, propositions);
        if (expansion) change(expansion.source, false,
          expansion.origins.length ? expansion.origins : null);
      } catch (error) {
        hint.textContent = 'Could not expand this rule; proof unchanged.';
        console.error('Proof Explorer expansion:', error);
      }
    }, true);
    undo.addEventListener('click', () => {
      if (busy || bulkBusy || !history.length) return;
      change(history[history.length - 1], true);
    });

    render().catch(error => {
      hint.textContent = 'Expansion is unavailable for this tree.';
      console.warn('Proof Explorer:', error);
    });
  }

  function showStartupWarning(message) {
    const toolbar = document.querySelector('.proof-explorer-toolbar');
    if (!toolbar) return;
    const target = toolbar.querySelector('.pe-toolbar-status') || toolbar;
    let warning = target.querySelector('.pe-explorer-warning');
    if (!warning) {
      warning = document.createElement('span');
      warning.className = 'pe-explorer-warning';
      warning.setAttribute('role', 'status');
      target.append(warning);
    }
    warning.textContent = message;
  }

  function start(rules, propositions, dependencies, registryIssue = '') {
    const stage = document.querySelector('.proof-explorer-stage');
    if (!stage) return false;
    const snippet = stage.querySelector(':scope > .formalderivation');
    const key = snippet?.style.getPropertyValue('--explorer-id').trim();
    if (key && [...document.querySelectorAll('.explorerderivation')]
      .some(el => el.style.getPropertyValue('--explorer-id').trim() === key)) return false;
    const item = locateExplorerMath(stage);
    if (!item) return false;
    try {
      initialize(stage, item, rules, propositions, dependencies, registryIssue);
    } catch (error) {
      // A diagnostic must remain visible in the viewer even if a future
      // registry or rendering change prevents constructing the new sidebar.
      console.error('Proof Explorer: could not initialize enhanced viewer:', error);
      showStartupWarning('Proof Explorer enhancement failed: ' + error.message +
        '. Zoom and textbook navigation remain available.');
      return true;
    }
    return true;
  }

  async function waitForExplorer() {
    const url = new URL('assets/proof-rules.json', location.href);
    // The basic proof viewer must never depend on the JSON registry. If the
    // registry is absent, stale or malformed, initialize the enhanced toolbar
    // with no expansion rules and an explicit incomplete-dependency warning.
    let data = {rules: {}, propositions: {}, dependencies: {}};
    let registryIssue = '';
    try {
      const response = await fetch(url, {cache: 'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const candidate = await response.json();
      if (candidate.version !== 7 || !candidate.rules || !candidate.propositions) {
        throw new Error('Incompatible proof registry (expected version 7)');
      }
      data = candidate;
    } catch (error) {
      console.warn('Proof Explorer: rule registry unavailable:', error);
      registryIssue = 'Proof registry unavailable (' + error.message +
        '). Expansions are disabled and the dependency index is incomplete.';
    }
    const rules = Object.values(data.rules);
    const propositions = data.propositions;
    const dependencies = data.dependencies || {};
    if (start(rules, propositions, dependencies, registryIssue)) return;
    // The full explorerderivation may be moved into the stage after MathJax
    // settles. Observe that transition without requiring proof JSON to load.
    const observer = new MutationObserver(() => {
      if (start(rules, propositions, dependencies, registryIssue)) observer.disconnect();
    });
    observer.observe(document.body, {childList: true, subtree: true});
    setTimeout(() => {
      observer.disconnect();
      if (!document.querySelector('.pe-toolbar-head')) {
        showStartupWarning('Proof Explorer could not locate the authored MathJax derivation. ' +
          'Zoom and textbook navigation remain available.');
      }
    }, 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForExplorer, {once: true});
  } else {
    waitForExplorer();
  }
})();


