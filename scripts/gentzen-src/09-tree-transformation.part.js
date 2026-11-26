  function formulaVariablesInProof(tex) {
    const variables = new Set();
    const formulas = /\\(?:AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC)\b/g;
    let command;
    while ((command = formulas.exec(tex))) {
      const arg = braced(tex, formulas.lastIndex);
      if (!arg) throw new Error('Malformed proof formula while selecting fresh variables');
      formulas.lastIndex = arg.end;
      for (const token of mathTokens(arg.content)) {
        if (SIMPLE_VAR.test(token)) variables.add(token);
      }
    }
    return variables;
  }

  function freshSubstitutions(source, hit) {
    const substitutions = Object.assign(Object.create(null), hit.bindings);
    const fresh = hit.rule.fresh || [];
    const template = hit.variant?.template || hit.rule.template || '';
    const used = formulaVariablesInProof(source);
    // Names already occurring in the template, including its quantified
    // binders, are unavailable unless they are exactly the local variables
    // that this expansion itself renames. This prevents \\forall B(B\\in C)
    // from turning into \\forall B(B\\in B) when C is freshened.
    const locals = new Set(fresh);
    for (const variable of formulaVariablesInProof(template)) {
      if (!locals.has(variable)) used.add(variable);
    }
    for (const value of Object.values(substitutions)) {
      used.add(value);
      // A class-term binding may itself contain variables. Fresh auxiliary
      // variables must not capture any of its free parameters (or binders).
      for (const token of mathTokens(value)) if (BINDER_VAR.test(token)) used.add(token);
    }

    const lower = ['a', 'b', 'c', 'x', 'y', 'z'];
    const upper = ['A', 'B', 'C', 'X', 'Y', 'Z'];
    for (const local of fresh) {
      const isUpper = /^[A-Z]/.test(local);
      const options = isUpper ? upper : lower;
      let candidate = options.find(variable => !used.has(variable));
      if (!candidate) {
        const stem = isUpper ? 'Z' : 'z';
        let next = 0;
        do { candidate = `${stem}_{${next++}}`; } while (used.has(candidate));
      }
      used.add(candidate);
      substitutions[local] = candidate;
    }
    return substitutions;
  }

  // Substitute only the actual formula arguments, not rule names, hyperlinks,
  // label numbers or filenames. Preserve the original final conclusion verbatim.
  function instantiateTemplate(template, substitutions, originalConclusion) {
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC)\b/g;
    const found = [];
    let match;
    while ((match = command.exec(template))) {
      const arg = braced(template, command.lastIndex);
      if (!arg) throw new Error('Bad formula argument in registered derivation');
      found.push({name: match[1], arg});
      command.lastIndex = arg.end;
    }
    const last = found.length - 1;
    let rewritten = template;
    for (let i = last; i >= 0; i--) {
      const {name, arg} = found[i];
      let formula = (i === last && name !== 'AxiomC')
        ? originalConclusion : substituteFormula(arg.content, substitutions);
      const term = substitutions.T;
      if (term && term.startsWith('\\{') && !(i === last && name !== 'AxiomC')) {
        // Subscripts on the metalinguistic Cond_T and Real_T must be braced
        // when T is instantiated by an actual class-builder expression.
        formula = formula.replaceAll('\\Cond_' + term, '\\Cond_{' + term + '}')
          .replaceAll('\\Real_' + term, '\\Real_{' + term + '}');
      }
      rewritten = rewritten.slice(0, arg.start + 1) + formula +
        rewritten.slice(arg.end - 1);
    }
    return rewritten;
  }

  // Preserve source premise order even when the registered justification
  // finishes with a unary step (e.g. Mutual Inclusion -> Extensionality).
  // Swap the branches at the least common binary ancestor of the two
  // schematic premise slots; leave their entire internal trees unchanged.
  // Must be called before the premise placeholders are grafted.
  function preserveBinaryPremiseOrder(tex) {
    const command = /@@PE_PREMISE_([01])@@|\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC)\b/g;
    const arities = {UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
                     QuaternaryInfC: 4, QuinaryInfC: 5};
    const stack = [];
    let pair = null;
    let match;
    while ((match = command.exec(tex))) {
      if (match[1] !== undefined) {
        stack.push({start: match.index, end: command.lastIndex,
                    slots: new Set([Number(match[1])])});
        continue;
      }
      const name = match[2];
      const arg = braced(tex, command.lastIndex);
      if (!arg) return tex;
      command.lastIndex = arg.end;
      if (name === 'AxiomC') {
        stack.push({start: match.index, end: arg.end, slots: new Set()});
        continue;
      }
      const arity = arities[name];
      if (!arity || stack.length < arity) return tex;
      const children = stack.splice(-arity, arity);
      if (arity === 2 && !pair &&
          children[0].slots.size === 1 && children[0].slots.has(0) &&
          children[1].slots.size === 1 && children[1].slots.has(1)) {
        pair = children;
      }
      const slots = new Set(children.flatMap(child => Array.from(child.slots)));
      stack.push({start: children[0].start, end: arg.end, slots});
    }
    if (!pair || stack.length !== 1) return tex;
    const [left, right] = pair;
    const leftText = tex.slice(left.start, right.start);
    const rightText = tex.slice(right.start, right.end);
    return tex.slice(0, left.start) + rightText + '\n' +
      leftText + tex.slice(right.end);
  }

  // Freshen local assumptions by editing only inference labels.
  function freshenLocalDischarges(source, template, localNumbers) {
    if (!localNumbers?.length) return template;
    const used = new Set();
    const command = /\\(?:RightLabel|RL|LeftLabel|LL)\b/g;
    const harvest = tex => {
      const re = new RegExp(command.source, 'g');
      let match;
      while ((match = re.exec(tex))) {
        const arg = braced(tex, re.lastIndex);
        if (!arg) throw new Error('Malformed assumption label');
        re.lastIndex = arg.end;
        for (const tag of labelNumbers(arg.content)) used.add(Number(tag));
      }
    };
    harvest(source);
    harvest(template);
    let result = template;
    for (const local of localNumbers) {
      const placeholder = `@@PE_LOCAL_${local}@@`;
      if (!result.includes(placeholder)) throw new Error(`Missing local discharge slot ${local}`);
      let candidate = 1;
      while (used.has(candidate)) candidate++;
      used.add(candidate);
      result = result.replaceAll(placeholder, String(candidate));
    }
    if (result.includes('@@PE_LOCAL_')) throw new Error('Unresolved local discharge slot');
    return result;
  }

  // Rename assumption classes in a complete theorem proof, along with ALL
  // of their discharge references, to avoid capture in its surrounding proof.
  function freshenTheoremLabels(source, theorem) {
    const command = /\\(?:RightLabel|RL|LeftLabel|LL)\b/g;
    const scan = (tex, fn) => {
      const re = new RegExp(command.source, 'g');
      let match;
      while ((match = re.exec(tex))) {
        const arg = braced(tex, re.lastIndex);
        if (!arg) throw new Error('Malformed theorem inference label');
        re.lastIndex = arg.end;
        fn(arg);
      }
    };
    const used = new Set();
    scan(source, arg => {
      for (const tag of labelNumbers(arg.content)) used.add(Number(tag));
    });
    const labels = new Set();
    scan(theorem, arg => {
      const label = normalizeRuleLabel(arg.content);
      if (/^[1-9]\d*$/.test(label)) labels.add(label);
    });
    const translation = new Map();
    let candidate = 1;
    for (const label of labels) {
      while (used.has(candidate)) candidate++;
      translation.set(label, String(candidate));
      used.add(candidate++);
    }
    const edits = [];
    scan(theorem, arg => {
      const updated = rewrittenLabelNumbers(arg.content, translation);
      if (updated !== arg.content) edits.push([arg.start + 1, arg.end - 1, updated]);
    });
    let result = theorem;
    for (const [start, end, replacement] of edits.reverse()) {
      result = result.slice(0, start) + replacement + result.slice(end);
    }
    return result;
  }

  function expandOnce(source, id, rules, propositions) {
    const hit = allApplications(source, rules, propositions).find(item => item.id === id);
    if (!hit) return null;
    if (hit.type === 'proposition') {
      const substitutions = freshSubstitutions(source, hit);
      let replacement = instantiateTemplate(
        hit.variant.template, substitutions, hit.originalConclusion
      );
      replacement = freshenLocalDischarges(source, replacement, hit.variant.locals);
      if (hit.variant.kind === 'theorem') {
        replacement = freshenTheoremLabels(source, replacement);
      } else {
        if (!replacement.includes('@@PE_PREMISE_0@@')) {
          throw new Error('Proposition proof contains no premise attachment point');
        }
        replacement = replacement.replaceAll('@@PE_PREMISE_0@@', hit.premiseSources[0]);
      }
      if (/@@PE_(?:PREMISE|LOCAL)_/.test(replacement)) {
        throw new Error('Unresolved placeholder in proposition proof');
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    if (hit.rule.kind === 'forall-i-star') {
      let replacement = hit.premiseSources[0];
      for (const formula of hit.forallStar.steps) {
        replacement += `\n\\RightLabel{\\(\\forall\\)-I}\n\\UnaryInfC{${formula}}`;
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    if (hit.rule.kind === 'unique' && hit.rule.variant === 'atmost-intro') {
      return expandAtMostIntroduction(source, hit);
    }
    if (hit.rule.kind === 'unique') {
      let replacement = uniqueTemplate(hit);
      if (hit.premiseOrder.length === 2 && hit.premiseOrder[0] === 1) {
        replacement = preserveBinaryPremiseOrder(replacement);
      }
      for (let i = 0; i < hit.premiseSources.length; i++) {
        replacement = replacement.replaceAll(`@@PE_PREMISE_${i}@@`, hit.premiseSources[i]);
      }
      if (replacement.includes('@@PE_PREMISE_')) {
        throw new Error('Unresolved unique-existence premise placeholder');
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    if (hit.rule.kind === 'builder') {
      let replacement = builderTemplate(hit);
      if (hit.premiseOrder.length === 2 && hit.premiseOrder[0] === 1) {
        replacement = preserveBinaryPremiseOrder(replacement);
      }
      for (let i = 0; i < hit.premiseSources.length; i++) {
        replacement = replacement.replaceAll(`@@PE_PREMISE_${i}@@`, hit.premiseSources[i]);
      }
      if (replacement.includes('@@PE_PREMISE_')) {
        throw new Error('Unresolved class-builder proof premise');
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    if (hit.rule.kind === 'restricted') {
      let replacement = restrictedTemplate(hit);
      if (hit.rule.mode === 'exists-e') {
        hit.premiseSources[1] = replaceRestrictedAssumptions(
          hit.premiseSources[1], hit.restricted
        );
      }
      if (hit.premiseOrder.length === 2 && hit.premiseOrder[0] === 1) {
        replacement = preserveBinaryPremiseOrder(replacement);
      }
      for (let i = 0; i < hit.premiseSources.length; i++) {
        replacement = replacement.replaceAll(`@@PE_PREMISE_${i}@@`, hit.premiseSources[i]);
      }
      if (hit.rule.mode === 'exists-e') {
        replacement = freshenLocalDischarges(source, replacement, ['k']);
      }
      if (/@@PE_(?:PREMISE|LOCAL)_/.test(replacement)) {
        throw new Error('Unresolved restricted-quantifier proof placeholder');
      }
      return source.slice(0, hit.start) + replacement + source.slice(hit.end);
    }
    const substitutions = freshSubstitutions(source, hit);
    const chosenTemplate = hit.rule.kind === 'and-con' && hit.andConSide === 'right'
      ? hit.rule.templateRight : hit.rule.template;
    if (!chosenTemplate) throw new Error('Missing conjunction-congruence template');
    let replacement = instantiateTemplate(
      chosenTemplate, substitutions, hit.originalConclusion
    );
    if (hit.rule.kind === 'subproof') {
      if (!hit.dischargeTag || !replacement.includes('@@PE_DISCHARGE@@')) {
        throw new Error('Missing discharge marker in the registered subproof');
      }
      replacement = replacement.replaceAll('@@PE_DISCHARGE@@',
        hit.dischargeTag);
    }
    replacement = freshenLocalDischarges(source, replacement, hit.rule.locals);
    if (hit.premiseOrder?.length === 2 && hit.premiseOrder[0] === 1) {
      replacement = preserveBinaryPremiseOrder(replacement);
    }
    for (let i = 0; i < hit.premiseSources.length; i++) {
      const placeholder = `@@PE_PREMISE_${i}@@`;
      if (!replacement.includes(placeholder)) {
        throw new Error(`Missing premise slot ${i+1} in registered proof`);
      }
      replacement = replacement.replace(placeholder, hit.premiseSources[i]);
    }
    if (replacement.includes('@@PE_PREMISE_')) {
      throw new Error('Unresolved premise slot in registered proof');
    }
    return source.slice(0, hit.start) + replacement + source.slice(hit.end);
  }

  // A direction of a proposition may consist solely of forwarding the
  // existing premise to an earlier proposition. That is a real dependency,
  // but it introduces no new proof steps. Transparently expand the earlier
  // proposition in the same click, preserving both provenance links.
  function isPropositionForwarder(hit) {
    return hit?.type === 'proposition' &&
      /^@@PE_PREMISE_0@@\s*\\(?:RightLabel|RL)\s*\{\s*P\s*\\href\{[^{}]+\}\{[^{}]+\}\s*\}\s*\\UnaryInfC\s*\{[^{}]*\}\s*$/.test(
        hit.variant.template.trim()
      );
  }

  function expandWithForwarding(source, id, rules, propositions) {
    const application = allApplications(source, rules, propositions)
      .find(hit => hit.id === id);
    if (!application) return null;
    let next = expandOnce(source, id, rules, propositions);
    if (!next) return null;
    const origins = application.type === 'proposition'
      ? [application.proposition] : [];

    if (isPropositionForwarder(application)) {
      const forwarded = allApplications(next, rules, propositions).find(hit =>
        hit.type === 'proposition' &&
        hit.start === application.start &&
        hit.proposition.id !== application.proposition.id
      );
      if (forwarded) {
        const further = expandOnce(next, forwarded.id, rules, propositions);
        if (further) {
          next = further;
          origins.push(forwarded.proposition);
        }
      }
    }
    return {source: next, origins};
  }

