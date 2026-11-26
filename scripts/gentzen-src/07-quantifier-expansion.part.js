  const FORALL_STAR_TOKEN = /\\[A-Za-z@]+(?:_\{?[A-Za-z0-9]+\}?)?|\\.|[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?|[0-9]+|\s+|[^\s]/g;
  const FORALL_STAR_SPACE = new Set(['\\,', '\\;', '\\:', '\\!', '\\quad', '\\qquad']);
  // TeX sizing commands affect delimiters' appearance, not the formula.
  // In particular, \bigl( ... \bigr) and (...) must match under forall-I*.
  const FORALL_STAR_DELIMITER_SIZE = /^\\(?:left|right|middle|big|Big|bigg|Bigg)(?:[lrm])?$/;
  const FORALL_STAR_VAR = /^(?:[A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?|\\[A-Za-z]+(?:_\{?[A-Za-z0-9]+\}?)?)$/;

  function forallStarTokens(formula) {
    let s = canonicalMathSource(bareMath(formula));
    while (balancedOuterParen(s)) s = s.slice(1, -1).trim();
    return (s.match(FORALL_STAR_TOKEN) || []).filter(
      token => !/^\s+$/.test(token) && !FORALL_STAR_SPACE.has(token) &&
        !FORALL_STAR_DELIMITER_SIZE.test(token)
    );
  }

  // TeX control words must be separated from following letter tokens.
  // Joining \land + y as \landy would silently change the mathematics.
  function forallStarJoin(tokens) {
    let result = '';
    let previous = '';
    for (const token of tokens) {
      // Both \\forall and \\forall_S must be separated from the following
      // binder letter. Without this, joining makes \\forall_Sx (or \\inA).
      if (/^\\[A-Za-z@]+(?:_\{?[A-Za-z0-9]+\}?)?$/.test(previous) &&
          /^[A-Za-z@]/.test(token)) result += ' ';
      result += token;
      previous = token;
    }
    return result;
  }

  // x_0 and x_{0} are TeX spellings of the same variable.
  function forallStarVariableKey(token) {
    return token.replace(/_\{([A-Za-z0-9]+)\}$/, '_$1');
  }

  function isForallIStarLabel(label) {
    const compact = normalizeRuleLabel(label);
    return /^\\forall-I(?:\^\{(?:\*|\\ast)\}|\^(?:\*|\\ast)|\*)$/.test(compact);
  }

  // Collect dependencies at the root of the premise SUBDERIVATION, rather than
  // treating every historical assumption leaf as undischarged. We recognize
  // the primitive discharge rules used by the manuscript. Unrecognized
  // discharges are not assumed: they can only prevent an expansion.
  function forallStarDependencies(subtree) {
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
      if (hit[1] === 'RightLabel' || hit[1] === 'RL') {
        pending = normalizeRuleLabel(arg.content);
        continue;
      }
      if (hit[1] === 'AxiomC') {
        const empty = !forallStarTokens(arg.content).length;
        stack.push({empty, dependencies: empty ? [] : [{formula: arg.content, tag: null}]});
        pending = null;
        continue;
      }
      const arity = arities[hit[1]];
      if (!arity || stack.length < arity) return null;
      const children = stack.splice(-arity, arity);
      const dependencyLists = children.map(child => child.dependencies);
      if (arity === 1 && children[0].empty) {
        const assumption = pending?.match(/^([1-9][0-9]*)$/);
        dependencyLists[0] = assumption
          ? [{formula: arg.content, tag: assumption[1]}] : [];
      } else if (arity === 1) {
        const discharge = pending?.match(/^(?:\\to-I|\\neg-I|CR|\\forall_S-I|\\subseteq-I),([1-9][0-9]*)$/);
        if (discharge) {
          dependencyLists[0] = dependencyLists[0].filter(leaf => leaf.tag !== discharge[1]);
        }
      } else if (arity === 2) {
        const discharge = pending?.match(/^\\exists-E,([1-9][0-9]*)$/);
        if (discharge) {
          dependencyLists[1] = dependencyLists[1].filter(leaf => leaf.tag !== discharge[1]);
        }
      } else if (arity === 3) {
        const discharge = pending?.match(/^\\lor-E,([1-9][0-9]*),([1-9][0-9]*)$/);
        if (discharge) {
          dependencyLists[1] = dependencyLists[1].filter(leaf => leaf.tag !== discharge[1]);
          dependencyLists[2] = dependencyLists[2].filter(leaf => leaf.tag !== discharge[2]);
        }
      }
      stack.push({empty: false, dependencies: dependencyLists.flat()});
      pending = null;
    }
    return stack.length === 1 ? stack[0].dependencies : null;
  }

  // Quantification normally adds a scope parenthesis around the matrix.
  // Such an outer pair is typographical grouping, not a change of formula.
  function forallStarUnwrapTokens(tokens) {
    let result = tokens.slice();
    while (result[0] === '(' && result[result.length - 1] === ')') {
      let depth = 0;
      let complete = true;
      for (let i = 0; i < result.length; i++) {
        if (result[i] === '(') depth++;
        if (result[i] === ')' && --depth === 0 && i !== result.length - 1) {
          complete = false;
          break;
        }
      }
      if (!complete || depth !== 0) break;
      result = result.slice(1, -1);
    }
    return result;
  }

  // Recognize quantified binders that remain IN the matrix. Generalized
  // variables cannot be shadowed by those binders, and witnesses cannot
  // coincide with them (otherwise substitution may capture variables).
  function forallStarInnerBinders(tokens) {
    const bound = new Set();
    for (let i = 0; i < tokens.length; ++i) {
      if (!['\\forall', '\\exists', '\\forall_S', '\\exists_S', '\\Unique'].includes(tokens[i])) continue;
      let index = i + 1;
      if (tokens[i] === '\\exists' && tokens[index] === '!') index++;
      const binder = tokens[index];
      if (!binder || !FORALL_STAR_VAR.test(binder)) return null;
      bound.add(binder);
    }
    return bound;
  }

  // Return the complete sequence of intermediate conclusions (innermost
  // introduction first), or null unless the primitive-rule side conditions
  // can be established conservatively.
  function matchForallIStar(premiseFormula, finalConclusion, premiseSource) {
    if (/\\(?:vdots|cdots|ldots)\b/.test(premiseSource)) return null;
    const dependencies = forallStarDependencies(premiseSource);
    if (!dependencies) return null;
    const conclusion = forallStarTokens(finalConclusion);
    const premise = forallStarTokens(premiseFormula);
    const prefixes = [];
    let cursor = 0;
    while (conclusion[cursor] === '\\forall' &&
           FORALL_STAR_VAR.test(conclusion[cursor + 1] || '')) {
      const binder = conclusion[cursor + 1];
      if (prefixes.some(x => forallStarVariableKey(x.binder) === forallStarVariableKey(binder))) return null;
      cursor += 2;
      prefixes.push({binder, end: cursor});
    }
    if (!prefixes.length) return null;

    // The final formula can already contain universal quantifiers inherited
    // from the premise. Try every possible number of NEW introductions.
    for (let count = prefixes.length; count >= 1; --count) {
      const binders = prefixes.slice(0, count).map(x => x.binder);
      const matrix = conclusion.slice(prefixes[count - 1].end);
      const matrixView = forallStarUnwrapTokens(matrix);
      if (matrixView.length !== premise.length) continue;
      const inner = forallStarInnerBinders(matrix);
      if (!inner || binders.some(variable => inner.has(variable))) continue;
      const witness = new Map();
      let matches = true;
      for (let i = 0; i < matrixView.length; ++i) {
        const token = matrixView[i];
        if (binders.includes(token)) {
          const actual = premise[i];
          if (!FORALL_STAR_VAR.test(actual)) { matches = false; break; }
          if (witness.has(token) && witness.get(token) !== actual) {
            matches = false; break;
          }
          witness.set(token, actual);
        } else if (token !== premise[i]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // A vacuously introduced binder has no witness occurrence in the
      // premise. Choose an entirely unused metalinguistic witness for the
      // side-condition check; it will not enter any displayed formula.
      const occupied = new Set([
        ...conclusion, ...premise,
        ...dependencies.flatMap(leaf => forallStarTokens(leaf.formula)),
        ...Array.from(witness.values())
      ].map(forallStarVariableKey));
      for (const binder of binders) {
        if (witness.has(binder)) continue;
        let fresh = 'z_{0}';
        let n = 0;
        while (occupied.has(forallStarVariableKey(fresh))) fresh = `z_{${++n}}`;
        witness.set(binder, fresh);
        occupied.add(forallStarVariableKey(fresh));
      }

      const witnesses = binders.map(x => witness.get(x));
      if (new Set(witnesses.map(forallStarVariableKey)).size !== witnesses.length) continue;
      // Stronger than necessary in some shadowing cases, but safe: no
      // eigenvariable may occur anywhere in the final quantified expression.
      if (witnesses.some(eta => conclusion.some(
        token => forallStarVariableKey(token) === forallStarVariableKey(eta)
      ))) continue;
      if (dependencies.some(leaf => witnesses.some(eta => forallStarTokens(leaf.formula).some(
        token => forallStarVariableKey(token) === forallStarVariableKey(eta)
      )))) continue;

      const steps = [];
      for (let i = count - 1; i >= 0; --i) {
        if (i === 0) {
          steps.push(finalConclusion); // retain the source's final TeX exactly
          continue;
        }
        const stillFree = new Map(binders.slice(0, i).map(x => [x, witness.get(x)]));
        const body = forallStarJoin(matrix.map(token => stillFree.get(token) || token));
        const prefix = binders.slice(i).map(variable => `\\forall ${variable}\\,`).join('');
        steps.push(`\\(${prefix}${body}\\)`);
      }
      return {steps, binders, witnesses};
    }
    return null;
  }

  // Match discharge tags by label meaning, not by math-mode typography.
  // Both schematic n and concrete 3 may be authored inside or outside math mode.
