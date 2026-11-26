  function applicationLabel(rule, actual) {
    if (rule.kind === 'unique' && rule.variant === 'atmost-intro') {
      const compact = normalizeRuleLabel(canonicalMathSource(actual));
      const match = compact.match(/^\\Unique-I,([1-9]\d*),([1-9]\d*)$/);
      return match && match[1] !== match[2]
        ? {tag: null, tags: [match[1], match[2]]} : null;
    }
    if (rule.kind === 'restricted') return restrictedLabel(rule, actual);
    const expected = normalizeRuleLabel(rule.label);
    const observed = normalizeRuleLabel(actual);
    if (rule.kind !== 'subproof') return expected === observed ? {tag: null} : null;
    const schematic = expected.match(/^(.*),([A-Za-z0-9]+)$/);
    const concrete = observed.match(/^(.*),([1-9]\d*)$/);
    if (!schematic || !concrete || schematic[1] !== concrete[1] ||
        schematic[2] !== rule.discharge) return null;
    return {tag: concrete[2]};
  }

  // This narrow open-assumption inspection deliberately fails closed when
  // an eigenvariable occurs in an assumption it cannot establish as discharged.
  // It is NOT a general bound/free-variable analyzer or proof checker.
  function openAssumptions(subtree) {
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL)\b/g;
    const arities = {UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
                     QuaternaryInfC: 4, QuinaryInfC: 5};
    const stack = [];
    let pending = null;
    let hit;
    while ((hit = command.exec(subtree))) {
      const arg = braced(subtree, command.lastIndex);
      if (!arg) return null;
      command.lastIndex = arg.end;
      const name = hit[1];
      if (name === 'RightLabel' || name === 'RL') {
        pending = normalizeRuleLabel(arg.content).replace(/\s+/g, '');
        continue;
      }
      if (name === 'AxiomC') {
        const empty = !mathTokens(arg.content).length;
        stack.push({empty, leaves: empty ? [] : [{formula: arg.content, tag: null}]});
        pending = null;
        continue;
      }
      const arity = arities[name];
      if (!arity || stack.length < arity) return null;
      const children = stack.splice(-arity, arity);
      let leaves = children.flatMap(child => child.leaves);
      if (arity === 1 && children[0].empty) {
        const marker = pending?.match(/^([1-9]\d*)$/);
        leaves = [{formula: arg.content, tag: marker ? marker[1] : null}];
      }
      stack.push({empty: false, leaves});
      pending = null;
    }
    return stack.length === 1 ? stack[0].leaves : null;
  }

  function isSafeSubproof(rule, source, branch, bindings, tag) {
    // A schematic \vdots is not an actual subderivation to graft.
    if (/\\(?:vdots|cdots|ldots)\b/.test(branch)) return false;
    const eigen = bindings[rule.eigen];
    if (!eigen || !SIMPLE_VAR.test(eigen)) return false;
    // Check the eigenvariable condition in the conclusion.
    if (mathTokens(source).includes(eigen)) {
      // 'source' here is the final conclusion, not the whole proof.
      return false;
    }
    const assumptions = openAssumptions(branch);
    if (!assumptions) return false;
    const required = substituteFormula(rule.assumption, bindings);
    const sameFormula = (a, b) => mathTokens(a).join('') === mathTokens(b).join('');
    let discharged = 0;
    for (const leaf of assumptions) {
      if (leaf.tag === tag) {
        if (!sameFormula(leaf.formula, required)) return false;
        discharged++;
      } else if (mathTokens(leaf.formula).includes(eigen)) {
        return false;
      }
    }
    // The selected assumption must really occur in the supplied subproof.
    if (!discharged) return false;
    // Do not reuse a discharge number already consumed inside the branch.
    const rightLabels = /\\(?:RightLabel|RL)\b/g;
    let label;
    while ((label = rightLabels.exec(branch))) {
      const content = braced(branch, rightLabels.lastIndex);
      if (!content) return false;
      rightLabels.lastIndex = content.end;
      if (normalizeRuleLabel(content.content).includes(',') && labelNumbers(content.content).includes(tag)) return false;
    }
    return true;
  }

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
        label = {value: arg.content.trim(), start: match.index,
                 end: arg.end, command: name};
        continue;
      }
      if (name === 'AxiomC') {
        stack.push({formula: arg.content, start: match.index, end: arg.end});
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
      const branches = stack.splice(-arity, arity);
      if (label) {
        let rule = null, matchedLabel = null, matched = null;
        if (arity === 1 && isForallIStarLabel(label.value)) {
          const star = matchForallIStar(branches[0].formula, arg.content,
            source.slice(branches[0].start, branches[0].end));
          if (star) {
            rule = {id: 'forall-i-star', kind: 'forall-i-star', fresh: []};
            matchedLabel = {tag: null};
            matched = {bindings: {}, order: [0], forallStar: star};
          }
        }
        for (const candidate of (matched ? [] : rules)) {
          if (candidate.premises.length !== arity) continue;
          const candidateLabel = applicationLabel(candidate, label.value);
          if (!candidateLabel) continue;
          const candidateMatch = candidate.kind === 'and-con'
            ? matchAndConApplication(candidate, branches, arg.content)
            : candidate.kind === 'builder'
            ? matchBuilderApplication(candidate, branches, arg.content)
            : candidate.kind === 'restricted'
              ? matchRestrictedApplication(candidate, branches, arg.content,
                  candidateLabel, source)
            : candidate.kind === 'unique'
              ? candidate.variant === 'atmost-intro'
                ? (() => {
                    if (arity !== 1) return null;
                    const info = matchAtMostIntroduction(branches[0], arg.content,
                      source.slice(branches[0].start, branches[0].end), candidateLabel.tags);
                    return info ? {bindings: {}, order: [0], uniquenessIntro: info} : null;
                  })()
                : matchUniqueApplication(candidate, branches, arg.content)
              : matchRule(candidate, branches.map(branch => branch.formula), arg.content);
          if (!candidateMatch) continue;
          if (candidate.kind === 'subproof' && !isSafeSubproof(
                candidate, arg.content,
                source.slice(branches[0].start, branches[0].end),
                candidateMatch.bindings, candidateLabel.tag)) continue;
          rule = candidate;
          matchedLabel = candidateLabel;
          matched = candidateMatch;
          break;
        }
        if (matched) {
          hits.push({
            id: hits.length, rule, bindings: matched.bindings,
            premiseOrder: matched.order,
            dischargeTag: matchedLabel.tag,
            restricted: matched.restricted,
            builder: matched.builder,
            andConSide: matched.andConSide,
            unique: matched.unique,
            uniquenessIntro: matched.uniquenessIntro,
            forallStar: matched.forallStar,
            originalLabel: label.value,
            start: branches[0].start, end: arg.end,
            labelStart: label.start, labelEnd: label.end,
            labelCommand: label.command,
            premiseSources: matched.order.map(i => source.slice(branches[i].start, branches[i].end)),
            originalConclusion: arg.content
          });
        }
      }
      stack.push({formula: arg.content, start: branches[0].start, end: arg.end});
      label = null;
    }
    return hits;
  }

  // A proposition reference keeps its existing P-number hyperlink. The
  // *separate* adjacent ⊕ control triggers expansion, not navigation.
  function referencedProposition(label) {
    if (!/^\s*P\s*\\href\s*\{/.test(label)) return null;
    const match = label.match(/\\href\s*\{[^{}#]*#(prop:[^{}]+)\}\s*\{[^{}]+\}/);
    return match ? match[1] : null;
  }

  function findPropositionApplications(source, propositions) {
    const stack = [];
    const hits = [];
    let label = null;
    const command = /\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|RightLabel|RL)\b/g;
    const arities = {UnaryInfC: 1, BinaryInfC: 2, TrinaryInfC: 3,
                     QuaternaryInfC: 4, QuinaryInfC: 5};
    let match;
    while ((match = command.exec(source))) {
      const name = match[1];
      const arg = braced(source, command.lastIndex);
      if (!arg) continue;
      command.lastIndex = arg.end;
      if (name === 'RightLabel' || name === 'RL') {
        label = {value: arg.content.trim(), start: match.index,
                 end: arg.end, command: name};
        continue;
      }
      if (name === 'AxiomC') {
        stack.push({formula: arg.content, start: match.index, end: arg.end});
        label = null;
        continue;
      }
      const arity = arities[name];
      if (!arity || stack.length < arity) {
        label = null;
        continue;
      }
      const branches = stack.splice(-arity, arity);
      const id = label && referencedProposition(label.value);
      const proposition = id && propositions[id];
      if (proposition && arity === 1) {
        for (const variant of proposition.variants) {
          const schematic = {vars: proposition.vars,
            premises: variant.premises, conclusion: variant.conclusion};
          const matched = matchClassTermLawInstance(proposition, variant,
            branches[0].formula, arg.content) ||
            matchRule(schematic, [branches[0].formula], arg.content);
          if (!matched) continue;
          hits.push({type: 'proposition', proposition, variant,
            rule: {fresh: proposition.fresh}, bindings: matched.bindings,
            premiseSources: [source.slice(branches[0].start, branches[0].end)],
            start: branches[0].start, end: arg.end,
            labelStart: label.start, labelEnd: label.end,
            labelCommand: label.command, originalLabel: label.value,
            originalConclusion: arg.content});
          break;
        }
      }
      stack.push({formula: arg.content, start: branches[0].start, end: arg.end});
      label = null;
    }
    return hits;
  }

  function allApplications(source, rules, propositions) {
    const ruleHits = findApplications(source, rules).map(hit =>
      ({...hit, type: 'rule'}));
    const propositionHits = findPropositionApplications(source, propositions);
    const hits = ruleHits.concat(propositionHits).sort((a, b) =>
      a.labelStart - b.labelStart);
    hits.forEach((hit, index) => { hit.id = index; });
    return hits;
  }

  function markExpandableRules(source, rules, propositions) {
    const hits = allApplications(source, rules, propositions);
    let result = source;
    // Only replace each label, never entire overlapping nested subtrees.
    for (const hit of hits.slice().reverse()) {
      // Math mode is allowed both in the inference symbol and in numbered
      // assumption labels. Never nest an authored label inside \href:
      // MathJax may then parse \( ... \) as invalid nested math and
      // silently omit the link. Keep the label untouched and provide the
      // same separate expansion control used successfully by propositions.
      const prefix = hit.type === 'proposition' ? PROP_LINK_PREFIX : LINK_PREFIX;
      const marker = `\\${hit.labelCommand}{${hit.originalLabel}\\(\\,\\)\\href{${prefix}${hit.id}}{\\(\\oplus\\)}}`;
      result = result.slice(0, hit.labelStart) + marker + result.slice(hit.labelEnd);
    }
    return {tex: result, hits};
  }

  // Read only mathematical formula arguments: inference labels and prose
  // must not affect variable selection. Return ALL variable names, including
  // bound names; those can capture an inserted free variable too.
