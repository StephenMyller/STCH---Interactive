  const BUILDER_IGNORED = new Set(['\\,', '\\;', '\\:', '\\!', '\\quad', '\\qquad']);
  const BUILDER_SIZES = /^\\(?:left|right|middle|big|Big|bigg|Bigg)(?:[lrm])?$/;
  function builderTokens(formula) {
    return mathTokens(formula).filter(t => !BUILDER_IGNORED.has(t) && !BUILDER_SIZES.test(t))
      .map(t => t === '\\lbrace' ? '\\{' : t === '\\rbrace' ? '\\}' : t);
  }
  function builderJoin(tokens) {
    let text = '', preceding = '';
    for (const token of tokens) {
      // A TeX control word must not absorb the next bare symbol.
      if ((/^\\[A-Za-z@]+(?:_S)?$/.test(preceding) && /^[A-Za-z]/.test(token)) ||
          (BINDER_VAR.test(preceding) && BINDER_VAR.test(token))) text += ' ';
      text += token;
      preceding = token;
    }
    return text;
  }
  function builderEncloses(tokens, opener, closer) {
    if (tokens[0] !== opener || tokens[tokens.length - 1] !== closer) return false;
    let depth = 0;
    for (let i = 0; i < tokens.length; ++i) {
      if (tokens[i] === opener) depth++;
      else if (tokens[i] === closer && --depth === 0 && i !== tokens.length - 1) return false;
    }
    return depth === 0;
  }
  function builderStripGrouping(tokens) {
    while (builderEncloses(tokens, '(', ')') || builderEncloses(tokens, '{', '}')) {
      tokens = tokens.slice(1, -1);
    }
    return tokens;
  }
  function builderFormulaKey(formula) {
    return builderStripGrouping(builderTokens(formula)).join('');
  }
  function parseGeneralBuilder(tokens) {
    if (!builderEncloses(tokens, '\\{', '\\}')) return null;
    let depth = 0, mid = -1;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token === '\\{') depth++;
      else if (token === '\\}') depth--;
      else if (depth === 1 && (token === '\\mid' || token === '|')) {
        if (mid !== -1) return null;
        mid = i;
      }
    }
    if (mid !== 2 || !BINDER_VAR.test(tokens[1]) || mid === tokens.length - 2) return null;
    return {binder: tokens[1], body: tokens.slice(mid + 1, -1), term: builderJoin(tokens)};
  }
  function parseBuilderMembership(formula) {
    const tokens = builderStripGrouping(builderTokens(formula));
    let depth = 0, inIndex = -1;
    for (let i = 0; i < tokens.length; ++i) {
      const t = tokens[i];
      if (['(', '[', '{', '\\{'].includes(t)) depth++;
      else if ([')', ']', '}', '\\}'].includes(t)) depth--;
      else if (depth === 0 && t === '\\in') {
        if (inIndex !== -1) return null;
        inIndex = i;
      }
      if (depth < 0) return null;
    }
    if (depth !== 0 || inIndex !== 1 || !BINDER_VAR.test(tokens[0])) return null;
    const builder = parseGeneralBuilder(tokens.slice(inIndex + 1));
    return builder && {witness: tokens[0], ...builder};
  }
  function instantiateBuilderBody(body, binder, witness) {
    // Quantifiers are binders too. Reject potential shadowing/capture until
    // the full binder-aware formula parser is implemented. These checks must
    // not confuse the binder of an *inner class builder* with a quantifier.
    for (let i = 0; i < body.length; ++i) {
      if (['\\forall', '\\exists', '\\forall_S', '\\exists_S', '\\Unique'].includes(body[i])) {
        let j = i + 1;
        if (body[i] === '\\exists' && body[j] === '!') j++;
        if (body[j] === binder || body[j] === witness) return null;
      }
    }
    function rewrite(tokens) {
      const out = [];
      for (let i = 0; i < tokens.length; ++i) {
        if (tokens[i] !== '\\{') {
          // In the authored bounded-builder rule templates, a bare \\varphi
          // denotes the defining formula in the builder's binder. An actual
          // application uses the syntactically explicit \\varphi[witness/binder].
          // Never rewrite this marker inside a shadowing nested builder.
          if (tokens[i] === '\\varphi') {
            out.push('\\varphi', '[', ...builderTokens(witness), '/', ...builderTokens(binder), ']');
          } else {
            out.push(tokens[i] === binder ? witness : tokens[i]);
          }
          continue;
        }
        // Locate the matching end of this nested builder.
        let depth = 0, end = -1;
        for (let j = i; j < tokens.length; ++j) {
          if (tokens[j] === '\\{') depth++;
          if (tokens[j] === '\\}' && --depth === 0) {end = j; break;}
        }
        if (end < 0) return null;
        const nested = parseGeneralBuilder(tokens.slice(i, end + 1));
        if (!nested) return null;
        if (nested.binder === binder) {
          out.push(...tokens.slice(i, end + 1)); // binder shadows outer binder
        } else {
          if (nested.binder === witness && nested.body.includes(binder)) return null;
          const inner = rewrite(nested.body);
          if (!inner) return null;
          out.push('\\{', nested.binder, '\\mid', ...inner, '\\}');
        }
        i = end;
      }
      return out;
    }
    const rewritten = rewrite(body);
    return rewritten && builderJoin(rewritten);
  }
  function matchBuilderApplication(rule, branches, conclusion) {
    const isIntro = rule.mode === 'membership-i';
    if (!['membership-i', 'membership-e'].includes(rule.mode) ||
        branches.length !== (isIntro ? 2 : 1)) return null;
    const parsed = parseBuilderMembership(isIntro ? conclusion : branches[0].formula);
    if (!parsed) return null;
    const instance = instantiateBuilderBody(parsed.body, parsed.binder, parsed.witness);
    if (instance === null) return null;
    if (isIntro) {
      const orders = [[0,1], [1,0]];
      for (const order of orders) {
        if (builderFormulaKey(branches[order[0]].formula) === builderFormulaKey(`\\Set(${parsed.witness})`) &&
            builderFormulaKey(branches[order[1]].formula) === builderFormulaKey(instance)) {
          return {bindings: {}, order, builder: {...parsed, instance}};
        }
      }
      return null;
    }
    return builderFormulaKey(conclusion) === builderFormulaKey(instance)
      ? {bindings: {}, order: [0], builder: {...parsed, instance}} : null;
  }

  // Schematic class-term laws are indexed like ordinary propositions, but
  // their T argument denotes a whole admitted class term, not one letter.
  // Recognize only the two declared law shapes. This is not general formula
  // matching; every occurrence of the term must agree syntactically.
  function matchClassTermLawInstance(proposition, variant, premise, conclusion) {
    const kind = proposition.id === 'prop:class-builder-membership-law'
      ? {op: '\\in', condition: 'Cond', variable: 'a'}
      : proposition.id === 'prop:class-builder-identity-law'
        ? {op: '=', condition: 'Real', variable: 'A'} : null;
    if (!kind) return null;
    function atomic(termFormula) {
      const tokens = builderStripGrouping(builderTokens(termFormula));
      if (tokens.length < 3 || !BINDER_VAR.test(tokens[0]) || tokens[1] !== kind.op) return null;
      const termTokens = tokens.slice(2);
      if (!((termTokens.length === 1 && BINDER_VAR.test(termTokens[0])) ||
            parseGeneralBuilder(termTokens))) return null;
      return {witness: tokens[0], term: builderJoin(termTokens)};
    }
    function condition(data) {
      return `\\${kind.condition}_{${data.term}}(${data.witness})`;
    }
    function sameCondition(actual, data) {
      const compact = builderFormulaKey(actual);
      return compact === builderFormulaKey(condition(data)) ||
        compact === builderFormulaKey(`\\${kind.condition}_${data.term}(${data.witness})`);
    }
    let instance;
    if (variant.kind === 'theorem' && !builderFormulaKey(premise)) {
      const tokens = builderStripGrouping(builderTokens(conclusion));
      let depth = 0, split = -1;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (['(', '[', '{', '\\{'].includes(token)) depth++;
        else if ([')', ']', '}', '\\}'].includes(token)) depth--;
        if (depth === 0 && token === '\\leftrightarrow') {
          if (split !== -1) return null;
          split = i;
        }
        if (depth < 0) return null;
      }
      if (split < 0 || depth !== 0) return null;
      const lhs = atomic(builderJoin(builderStripGrouping(tokens.slice(0,split))));
      if (!lhs || !sameCondition(builderJoin(builderStripGrouping(tokens.slice(split+1))),lhs)) return null;
      instance = lhs;
    } else if (variant.kind === 'direction') {
      const membershipOnLeft = !variant.premises[0].includes(`\\${kind.condition}`);
      instance = atomic(membershipOnLeft ? premise : conclusion);
      if (!instance || !sameCondition(membershipOnLeft ? conclusion : premise,instance)) return null;
    } else return null;
    return {bindings: {[kind.variable]: instance.witness, T: instance.term}, order: [0]};
  }

  function restrictedLabel(rule, actual) {
    const s = normalizeRuleLabel(actual);
    const quantifier = rule.mode.startsWith('forall') ? '\\forall_S' : '\\exists_S';
    const op = rule.mode.endsWith('-i') ? 'I' : 'E';
    const head = `${quantifier}-${op}`;
    if (rule.mode === 'forall-e' || rule.mode === 'exists-i') {
      return s === head ? {tag: null} : null;
    }
    if (!s.startsWith(head + ',')) return null;
    const tail = s.slice(head.length + 1);
    if (rule.mode === 'forall-i') {
      return /^[1-9]\d*$/.test(tail) ? {tag: tail} : null;
    }
    const match = tail.match(/^([1-9]\d*),([1-9]\d*)$/);
    return match && match[1] !== match[2]
      ? {tag: null, n: match[1], m: match[2]} : null;
  }

  function tagIsDischargedWithin(source, tag) {
    const labels = /\\(?:RightLabel|RL)\b/g;
    let match;
    while ((match = labels.exec(source))) {
      const arg = braced(source, labels.lastIndex);
      if (!arg) return true;
      labels.lastIndex = arg.end;
      if (normalizeRuleLabel(arg.content).includes(',') && labelNumbers(arg.content).includes(tag)) {
        return true;
      }
    }
    return false;
  }

  // Treat the author's explicit substitution notation phi[zeta/xi] as an
  // instance of schematic phi under the restricted quantifier. This is a
  // *matching* convention only: the rendered conclusion stays as authored.
  // Ordinary literal instances remain the first, preferred case.
  function restrictedUniversalInstance(matrix, binder, witness, conclusion) {
    const literal = instantiatedMatrix(matrix, binder, witness);
    if (literal === null) return null;
    if (formulaKey(literal) === formulaKey(conclusion)) return literal;

    // \bigl(...\bigr) and similar TeX sizes do not affect logical formulas.
    const withoutSizes = text => text.replace(
      /\\(?:biggl|biggr|Biggl|Biggr|bigl|bigr|Bigl|Bigr|big|Big|bigg|Bigg|left|right|middle)\b/g,
      ''
    );
    let found = false;
    let mismatched = false;
    const annotated = bareMath(conclusion).replace(
      /\\(varphi|phi|psi|chi|theta)\s*\[\s*(\\[A-Za-z]+|[A-Za-z](?:_\{?[0-9]+\}?)?)\s*\/\s*(\\[A-Za-z]+|[A-Za-z](?:_\{?[0-9]+\}?)?)\s*\]/g,
      (whole, variable, to, from) => {
        if (to !== witness || from !== binder) {
          mismatched = true;
          return whole;
        }
        found = true;
        return `\\${variable}`;
      }
    );
    if (!found || mismatched ||
        formulaKey(withoutSizes(literal)) !== formulaKey(withoutSizes(annotated))) {
      return null;
    }
    return bareMath(conclusion);
  }

  function matchRestrictedApplication(rule, branches, conclusion, labelInfo, source) {
    const mode = rule.mode;
    const arity = mode === 'forall-i' ? 1 : 2;
    if (branches.length !== arity) return null;
    const orders = arity === 1 ? [[0]] : [[0, 1], [1, 0]];
    const check = (tag, leaves, expected, witness) => {
      if (!leaves?.some(leaf => leaf.tag === tag)) return false;
      return leaves.every(leaf => {
        if (leaf.tag === tag) return formulaKey(leaf.formula) === formulaKey(expected);
        return !appearsVariable(leaf.formula, witness);
      });
    };
    for (const order of orders) {
      const first = branches[order[0]], second = branches[order[1]];
      if (mode === 'forall-e') {
        const q = restrictedQuantifier(first.formula, 'forall');
        const witness = second && setVariable(second.formula);
        if (!q || !witness) continue;
        const instance = restrictedUniversalInstance(q.body, q.binder, witness, conclusion);
        if (instance === null) continue;
        return {bindings: {}, order, restricted: {q, witness, instance}};
      }
      if (mode === 'exists-i') {
        const q = restrictedQuantifier(conclusion, 'exists');
        const witness = setVariable(first.formula);
        if (!q || !witness || !second) continue;
        const instance = instantiatedMatrix(q.body, q.binder, witness);
        if (instance === null || formulaKey(instance) !== formulaKey(second.formula)) continue;
        return {bindings: {}, order, restricted: {q, witness, instance}};
      }
      if (mode === 'forall-i') {
        const q = restrictedQuantifier(conclusion, 'forall');
        if (!q || !labelInfo.tag) continue;
        const branchSource = source.slice(first.start, first.end);
        if (/\\(?:vdots|cdots|ldots)\b/.test(branchSource) ||
            tagIsDischargedWithin(branchSource, labelInfo.tag)) continue;
        const leaves = openAssumptions(branchSource);
        const possible = leaves?.filter(leaf => leaf.tag === labelInfo.tag).map(leaf => setVariable(leaf.formula));
        const witness = possible?.[0];
        if (!witness || possible.some(item => item !== witness) ||
            appearsVariable(q.body, witness)) continue;
        const instance = instantiatedMatrix(q.body, q.binder, witness);
        if (instance === null || formulaKey(instance) !== formulaKey(first.formula) ||
            !check(labelInfo.tag, leaves, `\\(\\Set(${witness})\\)`, witness)) continue;
        return {bindings: {}, order, restricted: {q, witness, instance, tag: labelInfo.tag}};
      }
      if (mode === 'exists-e') {
        const q = restrictedQuantifier(first.formula, 'exists');
        if (!q || !second || !labelInfo.n || !labelInfo.m ||
            formulaKey(second.formula) !== formulaKey(conclusion)) continue;
        const majorSource = source.slice(first.start, first.end);
        const minorSource = source.slice(second.start, second.end);
        if (/\\(?:vdots|cdots|ldots)\b/.test(minorSource) ||
            tagIsDischargedWithin(minorSource, labelInfo.n) ||
            tagIsDischargedWithin(minorSource, labelInfo.m)) continue;
        const minorLeaves = openAssumptions(minorSource);
        const majorLeaves = openAssumptions(majorSource);
        const taggedSet = minorLeaves?.filter(leaf => leaf.tag === labelInfo.n);
        const witnesses = taggedSet?.map(leaf => setVariable(leaf.formula));
        const witness = witnesses?.[0];
        if (!witness || !witnesses.length || witnesses.some(v => v !== witness) ||
            appearsVariable(q.body, witness) || appearsVariable(conclusion, witness)) continue;
        const instance = instantiatedMatrix(q.body, q.binder, witness);
        if (instance === null || !minorLeaves || !minorLeaves.some(l => l.tag === labelInfo.m) ||
            !minorLeaves.every(l => l.tag === labelInfo.n ?
              formulaKey(l.formula) === formulaKey(`\\(\\Set(${witness})\\)`) :
              l.tag === labelInfo.m ? formulaKey(l.formula) === formulaKey(instance) :
              !appearsVariable(l.formula, witness)) ||
            !majorLeaves || majorLeaves.some(leaf => appearsVariable(leaf.formula, witness))) continue;
        // Both discharged tags must occur, and every leaf bearing one must
        // represent its specified assumption (never an unrelated formula).
        return {bindings: {}, order, restricted: {q, witness, instance,
          n: labelInfo.n, m: labelInfo.m}};
      }
    }
    return null;
  }

  function replaceRestrictedAssumptions(minor, data) {
    const cmd = /\\(AxiomC|RightLabel|RL|UnaryInfC)\b/g;
    const calls = [];
    let match;
    while ((match = cmd.exec(minor))) {
      const arg = braced(minor, cmd.lastIndex);
      if (!arg) throw new Error('Malformed assumption line');
      calls.push({name: match[1], arg: arg.content, start: match.index, end: arg.end});
      cmd.lastIndex = arg.end;
    }
    const conjunct = `\\(\\Set(${data.witness})\\land (${stripMatrixParens(data.instance)})\\)`;
    const changes = [];
    const counts = {[data.n]: 0, [data.m]: 0};
    for (let i = 0; i + 2 < calls.length; i++) {
      const a = calls[i], b = calls[i+1], c = calls[i+2];
      if (a.name !== 'AxiomC' || formulaKey(a.arg) ||
          !['RightLabel','RL'].includes(b.name) || c.name !== 'UnaryInfC') continue;
      const tag = bareMath(b.arg).trim();
      if (tag !== data.n && tag !== data.m) continue;
      const expected = tag === data.n ? `\\Set(${data.witness})` : data.instance;
      if (formulaKey(c.arg) !== formulaKey(expected)) throw new Error('Incorrect discharged minor assumption');
      counts[tag]++;
      changes.push([a.start, c.end,
        `\\AxiomC{}\n\\RightLabel{@@PE_LOCAL_k@@}\n\\UnaryInfC{${conjunct}}\n` +
        `\\RightLabel{\\(\\land\\)-E}\n\\UnaryInfC{${c.arg}}`]);
      i += 2;
    }
    if (!counts[data.n] || !counts[data.m]) throw new Error('Missing restricted existential assumptions');
    for (const [start, end, value] of changes.reverse()) {
      minor = minor.slice(0, start) + value + minor.slice(end);
    }
    return minor;
  }

  function stripMatrixParens(source) {
    let s = source.trim();
    while (balancedOuterParen(s)) s = s.slice(1, -1).trim();
    return s;
  }

  // The restricted-rule expansions are reconstructed for each concrete
  // quantifier instance, but their definitional justification is authored in
  // the registry template. Reuse its already-resolved reference (including
  // the link and number) rather than displaying an anonymous "Def.".
  function restrictedDefinitionLabel(rule) {
    const source = rule?.template || '';
    const labels = /\\(?:RightLabel|RL)\b/g;
    let match;
    while ((match = labels.exec(source))) {
      const arg = braced(source, labels.lastIndex);
      if (!arg) break;
      labels.lastIndex = arg.end;
      const value = arg.content.trim();
      if (/^D\s*\\(?:href|ref)\b/.test(value)) return value;
    }
    throw new Error(`Missing numbered definition citation for ${rule?.id || 'restricted rule'}`);
  }

  function builderTemplate(hit) {
    const {witness, term, instance} = hit.builder;
    const mode = hit.rule.mode;
    const definition = hit.rule.definitionLabel;
    const law = hit.rule.lawLabel;
    if (!definition?.startsWith('D') || !law?.startsWith('P')) {
      throw new Error('Class-builder rule has missing numbered justification citations');
    }
    const condition = `\\Cond_{${term}}(${witness})`;
    const membership = `${witness}\\in ${term}`;
    const equivalence = `\\(${membership}\\leftrightarrow ${condition}\\)`;
    const conjunction = `\\(\\Set(${witness})\\land (${instance})\\)`;
    const canonical = `\\(${condition}\\)`;
    if (mode === 'membership-i') {
      return `@@PE_PREMISE_0@@\n@@PE_PREMISE_1@@\n` +
        `\\RightLabel{\\(\\land\\)-I}\n\\BinaryInfC{${conjunction}}\n` +
        `\\RightLabel{${definition}}\n\\dashedLine\n\\UnaryInfC{${canonical}}\n` +
        `\\AxiomC{}\n\\RightLabel{${law}}\n\\UnaryInfC{${equivalence}}\n` +
        `\\RightLabel{\\(\\leftrightarrow\\)-E}\n` +
        `\\BinaryInfC{${hit.originalConclusion}}`;
    }
    if (mode === 'membership-e') {
      return `\\AxiomC{}\n\\RightLabel{${law}}\n\\UnaryInfC{${equivalence}}\n` +
        `@@PE_PREMISE_0@@\n\\RightLabel{\\(\\leftrightarrow\\)-E}\n` +
        `\\BinaryInfC{${canonical}}\n\\RightLabel{${definition}}\n\\dashedLine\n` +
        `\\UnaryInfC{${conjunction}}\n\\RightLabel{\\(\\land\\)-E}\n` +
        `\\UnaryInfC{${hit.originalConclusion}}`;
    }
    throw new Error('Unsupported class-builder expansion mode');
  }

  function restrictedTemplate(hit) {
    const {q, witness, instance} = hit.restricted;
    const definitionLabel = restrictedDefinitionLabel(hit.rule);
    const matrix = `(${stripMatrixParens(q.body)})`;
    const instanceMatrix = `(${stripMatrixParens(instance)})`;
    const universal = `\\(\\forall ${q.binder}(\\Set(${q.binder})\\to ${matrix})\\)`;
    const existential = `\\(\\exists ${q.binder}(\\Set(${q.binder})\\land ${matrix})\\)`;
    const instanceImp = `\\(\\Set(${witness})\\to ${instanceMatrix}\\)`;
    const instanceConj = `\\(\\Set(${witness})\\land ${instanceMatrix}\\)`;
    const final = hit.originalConclusion;
    switch (hit.rule.mode) {
      case 'forall-i':
        return `@@PE_PREMISE_0@@\n\\RightLabel{\\(\\to\\)-I, ${hit.restricted.tag}}\n` +
          `\\UnaryInfC{${instanceImp}}\n\\RightLabel{\\(\\forall\\)-I}\n` +
          `\\UnaryInfC{${universal}}\n\\RightLabel{${definitionLabel}}\n\\dashedLine\n\\UnaryInfC{${final}}`;
      case 'forall-e':
        return `@@PE_PREMISE_0@@\n\\RightLabel{${definitionLabel}}\n\\dashedLine\n\\UnaryInfC{${universal}}\n` +
          `\\RightLabel{\\(\\forall\\)-E}\n\\UnaryInfC{${instanceImp}}\n` +
          `@@PE_PREMISE_1@@\n\\RightLabel{\\(\\to\\)-E}\n\\BinaryInfC{${final}}`;
      case 'exists-i':
        return `@@PE_PREMISE_0@@\n@@PE_PREMISE_1@@\n\\RightLabel{\\(\\land\\)-I}\n` +
          `\\BinaryInfC{${instanceConj}}\n\\RightLabel{\\(\\exists\\)-I}\n` +
          `\\UnaryInfC{${existential}}\n\\RightLabel{${definitionLabel}}\n\\dashedLine\n\\UnaryInfC{${final}}`;
      case 'exists-e':
        return `@@PE_PREMISE_0@@\n\\RightLabel{${definitionLabel}}\n\\dashedLine\n\\UnaryInfC{${existential}}\n` +
          `@@PE_PREMISE_1@@\n\\RightLabel{\\(\\exists\\)-E, @@PE_LOCAL_k@@}\n\\BinaryInfC{${final}}`;
      default: throw new Error('Unsupported restricted quantifier rule');
    }
  }

  // R* is a DISPLAY CONVENTION, not a derived rule in proof-rules.json.
  // In particular, forall-I* has a variable-length, formula-valued matrix.
  // It must reconstruct ordinary introductions rather than use the registry's
  // single-symbol schematic unifier. We deliberately fail closed on syntax
  // whose substitutions or assumption dependencies we cannot establish.
