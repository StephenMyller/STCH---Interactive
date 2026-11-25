#!/usr/bin/env python3
r"""Build Proof Explorer v1.1 registry from explicitly annotated LaTeX rules.

Supports unary, binary, locally discharged assumptions, and subderivation rules, with arbitrary branching in
justifications provided each schematic premise appears once as either a direct
AxiomC leaf or a numbered assumption line (AxiomC/RightLabel/UnaryInfC).
Other leaves (e.g. locally discharged assumptions) are preserved.

For a discharge rule, use:
% proof-explorer-expansion: rule:subset-i; vars=A,B,a; fresh=x; kind=subproof; discharge=n; eigen=a
The defining tree must contain a single conventional dotted schematic subproof:
  AxiomC{} / RightLabel{n} / UnaryInfC{assumption} / noLine /
  UnaryInfC{vdots} / noLine / UnaryInfC{premise}.
The engine checks the selected discharge assumption and conservatively rejects
applications if the eigenvariable occurs in other assumption leaves.

Annotation immediately before a formalderivation:
% proof-explorer-expansion: rule:set-I; vars=a,A; fresh=B

Assumption labels and discharge tags may appear in plain text, \( ... \), or
$...$. These forms are compared semantically, without requiring edits to the
LaTeX source; the original typesetting is preserved when labels are renamed.

This is a proof-exploration tool, NOT a general proof checker.
Direction-sensitive proposition extraction is opt-in and structurally conservative.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "proof-rules.json"

DERIVED = re.compile(
    r"\\begin\s*\{derivedrule\}(?:\[([^\]]+)\])?(.*?)\\end\s*\{derivedrule\}", re.S
)
ANNOTATION = re.compile(r"^[ \t]*%[ \t]*proof-explorer-expansion:[ \t]*([^\n\r]+)$", re.M)
PROP_ANNOTATION = re.compile(r"^[ \t]*%[ \t]*proof-explorer-proposition:[ \t]*([^\n\r]+)$", re.M)
PROPOSITION = re.compile(r"\\begin\s*\{proposition\}(?:\[[^\]]*\])?(.*?)\\end\s*\{proposition\}", re.S)
TREE = re.compile(r"\\begin\s*\{prooftree\}(.*?)\\end\s*\{prooftree\}", re.S)
COMMAND = re.compile(
    r"\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|"
    r"RightLabel|RL|LeftLabel|LL|dashedLine|solidLine|noLine|insertBetweenHyps)\b"
)
ARITIES = {"UnaryInfC": 1, "BinaryInfC": 2, "TrinaryInfC": 3,
           "QuaternaryInfC": 4, "QuinaryInfC": 5}
NUMBER_INDEX = re.compile(
    r'<script\s+id="gentzen-reference-index"\s+type="application/json">(.*?)</script>', re.S
)
REF = re.compile(r"\\ref\s*\{\s*([^{}\s]+)\s*\}")
HYPERREF = re.compile(r"\\hyperref\s*\[\s*([^\[\]\s]+)\s*\]\s*\{([^{}]*)\}")
VARNAME = re.compile(r"[A-Za-z](?:_\{?[0-9]+\}?)?\Z")


def error(message: str) -> None:
    raise ValueError(message)


def braced(text: str, offset: int) -> tuple[str, int]:
    i = offset
    while i < len(text) and text[i].isspace():
        i += 1
    if i >= len(text) or text[i] != "{":
        error(f"Expected braced argument near: {text[offset:offset + 70]!r}")
    start = i + 1
    depth = 1
    i += 1
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text) and text[i + 1] in "{}":
            i += 2
            continue
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start:i], i + 1
        i += 1
    error("Unclosed braced argument in prooftree")


def commands(tree: str):
    """Read bussproofs commands in order, retaining source offsets."""
    pos = 0
    result = []
    while match := COMMAND.search(tree, pos):
        op = match.group(1)
        if op in ("dashedLine", "solidLine", "noLine"):
            result.append({"op": op, "arg": None, "start": match.start(), "end": match.end()})
            pos = match.end()
        else:
            arg, pos = braced(tree, match.end())
            result.append({"op": op, "arg": arg, "start": match.start(), "end": pos})
    return result


# The preamble defines \Unique as \mathop{\exists^{\leq 1}}.
# Only normalize this specific operator: other \mathop forms keep their meaning.
_WEAK_UNIQUENESS = re.compile(
    r'\\exists\s*\^\s*(?:\{\s*\\(?:leqslant|leq|le)\s*1\s*\}|\\(?:leqslant|leq|le)\s*1)'
)
_MATHOP_UNIQUENESS = re.compile(r'\\mathop\s*\{\s*\\Unique\s*\}')


def canonical_uniqueness(tex: str) -> str:
    return _MATHOP_UNIQUENESS.sub(
        lambda _match: r'\Unique',
        _WEAK_UNIQUENESS.sub(lambda _match: r'\Unique', tex),
    )


def canon(tex: str) -> str:
    tex = tex.strip()
    if tex.startswith(r"\(") and tex.endswith(r"\)"):
        tex = tex[2:-2]
    return re.sub(r"\s+", "", canonical_uniqueness(tex))


# A label is metadata, not a formula. Its comparison must be independent of
# whether an author types a component as plain text, $...$, or \(...\).
# Keep the source offsets so number substitutions preserve the authored TeX.
_LABEL_MARKUP = re.compile(r'\\\(|\\\)|\\\[|\\\]|\$|\s+')


def label_projection(label: str):
    """Return (semantic label, raw offset of each retained character)."""
    chars, offsets = [], []
    pos = 0
    for match in _LABEL_MARKUP.finditer(label):
        for i in range(pos, match.start()):
            chars.append(label[i])
            offsets.append(i)
        pos = match.end()
    for i in range(pos, len(label)):
        chars.append(label[i])
        offsets.append(i)
    return ''.join(chars), offsets


def label_key(label: str | None) -> str:
    """Compare labels independent of math-mode and uniqueness typography."""
    return canonical_uniqueness(label_projection(label or '')[0])


def rewrite_label_tokens(label: str, mapping: dict[str, str]) -> str:
    """Rewrite only assumption tokens, preserving the rest of the label verbatim.

    This handles a stand-alone assumption number and any numeric discharge
    suffix, even with separate math wrappers around each number or around
    the complete label.
    """
    normalized, offsets = label_projection(label)
    if re.fullmatch(r'[1-9]\d*', normalized):
        selected = [(0, len(normalized))]
    else:
        suffix = re.search(r',([1-9]\d*(?:,[1-9]\d*)*)$', normalized)
        selected = [(suffix.start(1) + m.start(), suffix.start(1) + m.end())
                    for m in re.finditer(r'[1-9]\d*', suffix.group(1))] if suffix else []
    edits = []
    for start, end in selected:
        old = normalized[start:end]
        if old in mapping and mapping[old] != old:
            edits.append((offsets[start], offsets[end - 1] + 1, mapping[old]))
    for start, end, text in reversed(edits):
        label = label[:start] + text + label[end:]
    return label


def rewrite_schematic_discharge(label: str, tag: str, replacement: str):
    """Replace a final schematic discharge tag without disturbing math mode."""
    normalized, offsets = label_projection(label)
    suffix = ',' + tag
    if not normalized.endswith(suffix):
        return label, False
    start = len(normalized) - len(tag)
    return (label[:offsets[start]] + replacement + label[offsets[-1] + 1:], True)


def parse_tree(tree: str, location: str):
    """Parse stack layout and retain all AxiomC leaves (including assumptions)."""
    stack = []
    pending_label = None
    leaves = []
    for cmd in commands(tree):
        op, arg = cmd["op"], cmd["arg"]
        if op in ("RightLabel", "RL"):
            pending_label = arg.strip()
        elif op == "AxiomC":
            leaf = {"formula": arg, "children": [], "label": None}
            leaves.append((leaf, cmd))
            stack.append(leaf)
            pending_label = None
        elif op in ARITIES:
            arity = ARITIES[op]
            if len(stack) < arity:
                error(f"{location}: malformed prooftree (not enough premises for {op})")
            children = stack[-arity:]
            del stack[-arity:]
            stack.append({"formula": arg, "children": children, "label": pending_label})
            pending_label = None
    if len(stack) != 1:
        error(f"{location}: prooftree does not form exactly one tree")
    return stack[0], leaves


def schema_from(tree: str, location: str):
    root, _ = parse_tree(tree, location)
    premises = root["children"]
    if len(premises) not in (1, 2) or any(node["children"] for node in premises):
        error(f"{location}: v0.6 supports only one-step unary/binary rule schemata")
    return [node["formula"] for node in premises], root["formula"], root["label"]


def stub_in(tree: str, location: str):
    """Recognize the user's standard dotted subderivation as a single unit.

    This is an intentionally explicit, narrow source convention. A structural
    schema cannot be recovered from an arbitrary prooftree with ellipses.
    """
    cmds = commands(tree)
    names = [cmd["op"] for cmd in cmds]
    pattern = ["AxiomC", "RightLabel", "UnaryInfC", "noLine",
               "UnaryInfC", "noLine", "UnaryInfC"]
    matches = []
    for i in range(len(cmds) - len(pattern) + 1):
        block = cmds[i:i + len(pattern)]
        if ([cmd["op"] for cmd in block] == pattern
                and canon(block[0]["arg"]) == ""
                and canon(block[4]["arg"]) in (r"\vdots", r"\cdots")):
            matches.append({
                "start": block[0]["start"], "end": block[-1]["end"],
                "assumption": block[2]["arg"],
                "premise": block[6]["arg"],
                "tag": label_key(block[1]["arg"]),
            })
    if len(matches) != 1:
        error(f"{location}: subproof rule needs exactly one dotted schematic "
              "subderivation with a numbered assumption")
    return matches[0]


def schema_from_subproof(tree: str, tag: str, location: str):
    stub = stub_in(tree, location)
    if stub["tag"] != tag:
        error(f"{location}: schematic assumption tag must be {tag!r}")
    root, _ = parse_tree(tree, location)
    if len(root["children"]) != 1 or canon(root["children"][0]["formula"]) != canon(stub["premise"]):
        error(f"{location}: subproof schema must be one introduction step "
              "from the dotted subderivation")
    if not label_key(root["label"]).endswith("," + tag):
        error(f"{location}: final rule label must end with ', {tag}'")
    return [stub["premise"]], root["formula"], root["label"], stub["assumption"]


def proof_template_subproof(tree: str, premise: str, assumption: str,
                            conclusion: str, tag: str, location: str):
    root, _ = parse_tree(tree, location)
    if canon(root["formula"]) != canon(conclusion):
        error(f"{location}: justification does not end in rule conclusion")
    stub = stub_in(tree, location)
    if (canon(stub["premise"]) != canon(premise)
            or canon(stub["assumption"]) != canon(assumption)
            or stub["tag"] != tag):
        error(f"{location}: justification dotted subproof differs "
              "from the derived-rule schema")

    # Replace the whole schematic dotted branch, not merely its last formula.
    # The actual application supplies the complete proof, including assumptions.
    edits = [(stub["start"], stub["end"], "@@PE_PREMISE_0@@")]
    discharge_count = 0
    for cmd in commands(tree):
        if cmd["op"] not in ("RightLabel", "RL") or cmd["start"] < stub["end"]:
            continue
        new_label, replaced = rewrite_schematic_discharge(
            cmd["arg"], tag, "@@PE_DISCHARGE@@")
        if replaced:
            old = tree[cmd["start"]:cmd["end"]]
            edits.append((cmd["start"], cmd["end"],
                          old.replace("{" + cmd["arg"] + "}", "{" + new_label + "}", 1)))
            discharge_count += 1
    if discharge_count != 1:
        error(f"{location}: expected exactly one inference label discharging "
              f"assumption {tag!r}; found {discharge_count}")
    result = tree
    for start, end, replacement in sorted(edits, reverse=True):
        result = result[:start] + replacement + result[end:]
    return result


def annotation(raw: str, location: str):
    chunks = [part.strip() for part in raw.split(";")]
    key = chunks[0]
    if not re.fullmatch(r"rule:[\w:.-]+", key):
        error(f"{location}: invalid rule identifier {key!r}")
    options = {}
    for chunk in chunks[1:]:
        if "=" not in chunk:
            error(f"{location}: expected key=value metadata after ';'")
        option, value = [part.strip() for part in chunk.split("=", 1)]
        if option in options:
            error(f"{location}: duplicate metadata {option}")
        options[option] = value
    kind = options.get("kind", "ordinary")
    mode = options.get("mode")
    if kind not in ("restricted", "unique") and not options.get("vars"):
        error(f"{location}: specify schematic vars (e.g. vars=A,B,C)")
    if any(k not in ("vars", "fresh", "kind", "discharge", "eigen", "locals", "mode") for k in options):
        error(f"{location}: unknown annotation field")
    vars_ = [part.strip() for part in options.get("vars", "").split(",") if part.strip()]
    fresh = [part.strip() for part in options.get("fresh", "").split(",") if part.strip()]
    names = vars_ + fresh
    if len(names) != len(set(names)) or any(not VARNAME.fullmatch(name) for name in names):
        error(f"{location}: variables must be distinct single symbols, optionally subscripted")
    if kind not in ("ordinary", "subproof", "restricted", "unique"):
        error(f"{location}: unsupported expansion kind {kind!r}")
    tag = options.get("discharge")
    eigen = options.get("eigen")
    if kind == "subproof" and (not tag or not re.fullmatch(r"[A-Za-z0-9]+", tag)):
        error(f"{location}: kind=subproof requires a single discharge marker, e.g. discharge=n")
    if kind == "subproof" and eigen not in vars_:
        error(f"{location}: kind=subproof requires eigen= naming a schematic variable")
    if kind == "restricted":
        if mode not in ("forall-i", "forall-e", "exists-i", "exists-e"):
            error(f"{location}: restricted rule needs mode=forall-i/forall-e/exists-i/exists-e")
        if tag or eigen or vars_ or fresh or options.get("locals"):
            error(f"{location}: restricted annotations require only kind=restricted and mode=...")
    elif kind == "unique":
        if mode not in ("intro", "elim", "atmost-intro"):
            error(f"{location}: unique-quantifier rule requires mode=intro/elim/atmost-intro")
        if tag or eigen or vars_ or fresh or options.get("locals"):
            error(f"{location}: unique-quantifier annotations require only kind=unique and mode=...")
    elif mode:
        error(f"{location}: mode=... is reserved for special quantifier rules")
    if kind != "subproof" and (tag or eigen):
        error(f"{location}: discharge=/eigen= are only valid with kind=subproof")
    locals_ = [item.strip() for item in options.get("locals", "").split(",") if item.strip()]
    if any(not re.fullmatch(r"[1-9][0-9]*", n) for n in locals_) or len(set(locals_)) != len(locals_):
        error(f"{location}: locals must be distinct positive assumption numbers")
    return key, vars_, fresh, kind, tag, eigen, locals_, mode


def reference_index():
    for page in sorted(ROOT.glob("*.html")):
        if page.name == "main_html.html":
            continue
        match = NUMBER_INDEX.search(page.read_text(encoding="utf-8"))
        if match:
            return json.loads(match.group(1))
    error("No gentzen-reference-index found in generated HTML. Run reference resolution first.")


def resolve_label(tex: str, targets, location: str):
    def ref(match):
        label = match.group(1)
        if label not in targets:
            error(f"{location}: unresolved reference {label}")
        number, filename = targets[label]
        return rf"\href{{{filename}#{label}}}{{{number}}}"
    def hyperref(match):
        label, caption = match.groups()
        if label not in targets:
            error(f"{location}: unresolved numbered reference {label}")
        _, filename = targets[label]
        return rf"\href{{{filename}#{label}}}{{{caption}}}"
    return HYPERREF.sub(hyperref, REF.sub(ref, tex))


def proof_template(tree: str, premises: list[str], conclusion: str, location: str):
    r"""Identify premise attachment points without changing the authored proof.

    Each schematic premise must appear exactly once in either form:
      (1) a direct \AxiomC{formula} leaf, or
      (2) a numbered assumption line
          \AxiomC{} \RightLabel{number} \UnaryInfC{formula}.

    Local temporary assumptions (such as a\in A in subset introduction)
    are preserved and are not treated as schematic premise slots.
    """
    root, _ = parse_tree(tree, location)
    if canon(root["formula"]) != canon(conclusion):
        error(f"{location}: justification must end in the schematic rule conclusion")
    if len({canon(p) for p in premises}) != len(premises):
        error(f"{location}: identical premise formulas are ambiguous in v0.6")

    cmds = commands(tree)
    replacements = []
    for i, premise in enumerate(premises):
        matches = []
        for j, cmd in enumerate(cmds):
            if cmd["op"] != "AxiomC":
                continue
            # Standard bussproofs premise, without an assumption line.
            if canon(cmd["arg"]) == canon(premise):
                matches.append((cmd["start"], cmd["end"]))
            # User's convention: draw assumptions with a numbered inference line.
            if (canon(cmd["arg"]) == "" and j + 2 < len(cmds)
                    and cmds[j + 1]["op"] in ("RightLabel", "RL", "LeftLabel", "LL")
                    and cmds[j + 2]["op"] == "UnaryInfC"
                    and canon(cmds[j + 2]["arg"]) == canon(premise)):
                matches.append((cmd["start"], cmds[j + 2]["end"]))
        if len(matches) != 1:
            error(f"{location}: premise {i+1} has {len(matches)} attachment points; "
                  "requires exactly one direct premise leaf or numbered assumption line")
        start, end = matches[0]
        replacements.append((start, end, f"@@PE_PREMISE_{i}@@"))

    template = tree
    for start, end, marker in sorted(replacements, reverse=True):
        template = template[:start] + marker + template[end:]
    return template


def freshen_local_template_labels(template: str, labels: list[str], location: str):
    """Freshen numbered local assumptions and discharge sites in any math style."""
    if not labels:
        return template
    local = set(labels)
    assumptions = {tag: 0 for tag in local}
    discharges = {tag: 0 for tag in local}
    edits = []
    for cmd in commands(template):
        if cmd["op"] not in ("RightLabel", "RL", "LeftLabel", "LL"):
            continue
        arg = cmd["arg"]
        key = label_key(arg)
        if key in local:
            assumptions[key] += 1
        else:
            for tag in discharge_numbers(arg):
                if tag in local:
                    discharges[tag] += 1
        updated = rewrite_label_tokens(
            arg, {tag: f"@@PE_LOCAL_{tag}@@" for tag in local})
        if updated != arg:
            old = template[cmd["start"]:cmd["end"]]
            edits.append((cmd["start"], cmd["end"],
                          old.replace("{" + arg + "}", "{" + updated + "}", 1)))
    for tag in local:
        if assumptions[tag] != 1 or discharges[tag] != 1:
            error(f"{location}: local assumption {tag} must appear exactly once "
                  f"as an assumption and once as a discharge "
                  f"(found {assumptions[tag]} and {discharges[tag]})")
    for start, end, replacement in sorted(edits, reverse=True):
        template = template[:start] + replacement + template[end:]
    return template


def proposition_annotation(raw: str, location: str):
    """Opt-in registration, one line before the canonical formalderivation."""
    parts = [part.strip() for part in raw.split(';')]
    key = parts[0]
    if not re.fullmatch(r"prop:[\w:.-]+", key):
        error(f"{location}: invalid proposition identifier {key!r}")
    options = {}
    for part in parts[1:]:
        if '=' not in part:
            error(f"{location}: expected key=value after ';'")
        name, value = [field.strip() for field in part.split('=', 1)]
        if name in options or name not in ('vars', 'fresh'):
            error(f"{location}: unknown or duplicate proposition field {name!r}")
        options[name] = value
    if not options.get('vars'):
        error(f"{location}: proposition needs vars=A,B (schematic variables)")
    vars_ = [part.strip() for part in options['vars'].split(',') if part.strip()]
    fresh = [part.strip() for part in options.get('fresh', '').split(',') if part.strip()]
    if (any(not VARNAME.fullmatch(name) for name in vars_ + fresh)
            or len(vars_ + fresh) != len(set(vars_ + fresh))):
        error(f"{location}: invalid or repeated proposition variables")
    return key, vars_, fresh


def nodes_with_spans(tree: str, location: str):
    """Parse the existing proof stack and preserve source spans for grafting."""
    stack = []
    pending = None
    for cmd in commands(tree):
        op, arg = cmd['op'], cmd['arg']
        if op in ('RightLabel', 'RL'):
            pending = arg.strip()
        elif op == 'AxiomC':
            stack.append(dict(op=op, formula=arg, label=None,
                              start=cmd['start'], end=cmd['end'], children=[]))
            pending = None
        elif op in ARITIES:
            arity = ARITIES[op]
            if len(stack) < arity:
                error(f"{location}: malformed canonical prooftree")
            children = stack[-arity:]
            del stack[-arity:]
            stack.append(dict(op=op, formula=arg, label=pending,
                              start=children[0]['start'], end=cmd['end'], children=children))
            pending = None
    if len(stack) != 1:
        error(f"{location}: canonical prooftree is not a single tree")
    return stack[0]


def all_nodes(node):
    yield node
    for child in node['children']:
        yield from all_nodes(child)


def discharge_numbers(label: str | None) -> list[str]:
    """Read numeric discharge labels regardless of source math delimiters."""
    match = re.search(r",([1-9]\d*(?:,[1-9]\d*)*)$", label_key(label))
    return match.group(1).split(',') if match else []


def number_of_discharge(label: str | None):
    """Return a tag only for the single-discharge variant."""
    tags = discharge_numbers(label)
    return tags[0] if len(tags) == 1 else None


def assumption_tag(node):
    r"""Numbered assumption in RightLabel{3} or RightLabel{\(3\)}."""
    if (node['op'] != 'UnaryInfC' or len(node['children']) != 1
            or canon(node['children'][0]['formula']) != ''):
        return None
    match = re.fullmatch(r"([1-9][0-9]*)", label_key(node['label']))
    return match.group(1) if match else None


def local_discharge_numbers(template: str):
    """Find local assumption/discharge pairs in a canonical proof."""
    cmds = commands(template)
    uses = {}
    for i, cmd in enumerate(cmds):
        if cmd['op'] != 'AxiomC' or canon(cmd['arg']) != '':
            continue
        if (i + 2 < len(cmds) and cmds[i + 1]['op'] in ('RightLabel', 'RL')
                and cmds[i + 2]['op'] == 'UnaryInfC'):
            match = re.fullmatch(r"([1-9][0-9]*)", label_key(cmds[i + 1]['arg']))
            if match:
                tag = match.group(1)
                uses[tag] = uses.get(tag, 0) + 1
    discharges = {}
    for cmd in cmds:
        if cmd['op'] in ('RightLabel', 'RL'):
            for tag in discharge_numbers(cmd['arg']):
                discharges[tag] = discharges.get(tag, 0) + 1
    return sorted([tag for tag, count in uses.items()
                   if count == 1 and discharges.get(tag) == 1], key=int)


def edit_segments(text: str, changes: list[tuple[int, int, str]]):
    """Apply source-coordinate edits in descending order."""
    for start, end, value in sorted(changes, reverse=True):
        text = text[:start] + value + text[end:]
    return text



def unwrapped_formula(tex: str):
    r"""Remove \( ... \) and complete outer grouping parentheses only."""
    s = tex.strip()
    if s.startswith(r'\(') and s.endswith(r'\)'):
        s = s[2:-2].strip()
    while s.startswith('(') and s.endswith(')'):
        nesting = 0
        complete = False
        for i, char in enumerate(s):
            if char == '(': nesting += 1
            elif char == ')':
                nesting -= 1
                if nesting == 0:
                    complete = i == len(s) - 1
                    break
        if not complete: break
        s = s[1:-1].strip()
    return s


def split_top_connective(tex: str, name: str):
    """Only recognize an explicitly top-level connective in ordinary TeX."""
    s = unwrapped_formula(tex)
    depth = 0
    i = 0
    op = '\\' + name
    while i < len(s):
        if s[i] == '\\':
            if depth == 0 and s.startswith(op, i) and (
                i + len(op) == len(s) or not s[i + len(op)].isalpha()
            ):
                return unwrapped_formula(s[:i]), unwrapped_formula(s[i + len(op):])
            # A TeX macro is an indivisible token; skip through its letters.
            i += 1
            if i < len(s) and s[i].isalpha():
                while i < len(s) and s[i].isalpha(): i += 1
            else:
                i += 1
            continue
        if s[i] in '({[': depth += 1
        elif s[i] in ')}]': depth -= 1
        i += 1
    return None


def verify_numbered_assumptions_are_local(template: str, locals_: list[str], location: str):
    cmds = commands(template)
    for i, cmd in enumerate(cmds):
        if (cmd['op'] != 'AxiomC' or canon(cmd['arg']) != ''
                or i + 2 >= len(cmds)
                or cmds[i + 1]['op'] not in ('RightLabel', 'RL')
                or cmds[i + 2]['op'] != 'UnaryInfC'):
            continue
        match = re.fullmatch(r"([1-9][0-9]*)", label_key(cmds[i + 1]['arg']))
        if match and match.group(1) not in locals_:
            error(f"{location}: unaccounted open assumption {match.group(1)} in canonical proof")

def proof_prop_variants(tree: str, location: str):
    """Compile a proof into applications without constructing a theorem-statement detour.

    Supported: (1) final biconditional introduction with two discharged
    implication-introduction branches; (2) a direct derivation from one
    repeated premise or two distinct premises (joined by conjunction).
    """
    root = nodes_with_spans(tree, location)
    if (root['label'] and label_key(root['label']) == r'\leftrightarrow-I'
            and len(root['children']) == 2):
        theorem_halves = split_top_connective(root['formula'], 'leftrightarrow')
        if theorem_halves is None:
            error(f"{location}: final biconditional proof has no biconditional conclusion")
        results = []
        for branch in root['children']:
            tag = number_of_discharge(branch['label'])
            if (branch['op'] != 'UnaryInfC' or not tag or
                not label_key(branch['label']).startswith(r'\to-I,')):
                error(f"{location}: biconditional branch must end with a numbered \\to-I")
            body = branch['children'][0]
            selected = [n for n in all_nodes(body) if assumption_tag(n) == tag]
            if not selected:
                error(f"{location}: no assumptions to discharge for direction {tag}")
            assumption = selected[0]['formula']
            if any(canon(n['formula']) != canon(assumption) for n in selected):
                error(f"{location}: discharge {tag} changes assumption formulas")
            implication = split_top_connective(branch['formula'], 'to')
            if (implication is None or canon(implication[0]) != canon(unwrapped_formula(assumption))
                    or canon(implication[1]) != canon(unwrapped_formula(body['formula']))):
                error(f"{location}: implication branch does not prove its labeled direction")
            halves = [canon(part) for part in theorem_halves]
            endpoints = [canon(unwrapped_formula(assumption)), canon(unwrapped_formula(body['formula']))]
            if endpoints not in (halves, halves[::-1]):
                error(f"{location}: implication branch does not match the biconditional")
            # The user's branch must be a subproof of this implication; any
            # other undischarged direct premises would be unsafe to graft.
            if any(n['op'] == 'AxiomC' and canon(n['formula'])
                   for n in all_nodes(body)):
                error(f"{location}: direction {tag} depends on another open premise")
            part = tree[body['start']:body['end']]
            rel = [(n['start'] - body['start'], n['end'] - body['start'],
                    '@@PE_PREMISE_0@@') for n in selected]
            part = edit_segments(part, rel)
            locals_ = local_discharge_numbers(part)
            verify_numbered_assumptions_are_local(part, locals_, location)
            part = freshen_local_template_labels(part, locals_, location)
            results.append(dict(premises=[assumption], conclusion=body['formula'],
                                template=part, locals=locals_, kind='direction'))
        if len({(canon(v['premises'][0]), canon(v['conclusion'])) for v in results}) != 2:
            error(f"{location}: duplicate directional patterns")
        return results

    # A direct proof with one or two open premise formula types.
    leaves = [n for n in all_nodes(root)
              if n['op'] == 'AxiomC' and canon(n['formula'])]
    formulas = list(dict.fromkeys(canon(n['formula']) for n in leaves))
    if not formulas:
        # A theorem may have no open premises. Its proof can contain
        # numbered temporary assumptions, provided each is discharged.
        if any(r'\vdots' in (node['formula'] or '')
               for node in all_nodes(root)):
            error(f"{location}: theorem expansion contains an omitted subderivation")

        assumption_formulas = {}
        discharge_sites = {}

        def remaining_dependencies(node):
            label = assumption_tag(node)
            if label is not None:
                formula = canon(node['formula'])
                if label in assumption_formulas and assumption_formulas[label] != formula:
                    error(f"{location}: assumption class {label} has different formulas")
                assumption_formulas[label] = formula
                return {label}

            remaining = set().union(*(remaining_dependencies(child)
                                       for child in node['children']))
            if node['label'] and node['op'] == 'UnaryInfC':
                raw = label_key(node['label'])
                match = re.search(r',([1-9]\d*(?:,[1-9]\d*)*)$', raw)
                if match and (any(rule in raw for rule in
                                  (r'\to-I', r'\neg-I', r'\Unique-I', 'CR,'))):
                    for tag in match.group(1).split(','):
                        discharge_sites[tag] = discharge_sites.get(tag, 0) + 1
                        remaining.discard(tag)
            return remaining

        open_assumptions = remaining_dependencies(root)
        if open_assumptions:
            error(f"{location}: theorem proof has undischarged assumptions "
                  f"{sorted(open_assumptions, key=int)}")
        if any(discharge_sites.get(tag) != 1 for tag in assumption_formulas):
            error(f"{location}: every theorem assumption class must be discharged exactly once")

        return [dict(premises=[''], conclusion=root['formula'],
                     template=tree, locals=[], kind='theorem')]
    if len(formulas) not in (1, 2):
        error(f"{location}: direct proposition needs one or two distinct premises")
    original = {canon(n['formula']): n['formula'] for n in leaves}
    if len(formulas) == 1:
        premise = original[formulas[0]]
        replacement = lambda _: '@@PE_PREMISE_0@@'
    else:
        # The application supplies a conjunction. Derive each of its
        # conjuncts by ordinary conjunction elimination.
        one, two = [original[f] for f in formulas]
        premise = r'\(' + one.strip()[2:-2].strip() + r'\land ' + two.strip()[2:-2].strip() + r'\)'
        replacement = lambda leaf: (
            '@@PE_PREMISE_0@@\n'
            r'\RightLabel{\(\land\)-E}' + '\n'
            r'\UnaryInfC{' + leaf + '}'
        )
    part = edit_segments(tree, [(n['start'], n['end'], replacement(n['formula']))
                                for n in leaves])
    locals_ = local_discharge_numbers(part)
    verify_numbered_assumptions_are_local(part, locals_, location)
    part = freshen_local_template_labels(part, locals_, location)
    return [dict(premises=[premise], conclusion=root['formula'],
                 template=part, locals=locals_, kind='direct')]


def restricted_schema(tree: str, mode: str, location: str):
    """Check the schematic inference shape. A restricted-E minor premise can
    itself have two discharged assumptions, so it is not a plain AxiomC leaf.
    """
    root, _ = parse_tree(tree, location)
    arity = 1 if mode == "forall-i" else 2
    if len(root['children']) != arity:
        error(f"{location}: restricted {mode} must have {arity} premise(s)")
    label = label_key(root['label'])
    prefix = {'forall-i': r'\forall_S', 'forall-e': r'\forall_S',
              'exists-i': r'\exists_S', 'exists-e': r'\exists_S'}[mode]
    expected = f'{prefix}-' + ('I' if mode.endswith('-i') else 'E')
    if expected not in label:
        error(f"{location}: expected label for {expected}, found {root['label']!r}")
    if mode == 'forall-i':
        stub = stub_in(tree, location)
        if canon(root['children'][0]['formula']) != canon(stub['premise']):
            error(f"{location}: restricted universal introduction needs a dotted subproof")
    if mode == 'exists-e':
        # Verify two separate numbered assumptions and a schematic minor subproof.
        cmds = commands(tree)
        tags = []
        for i in range(len(cmds)-2):
            if (cmds[i]['op'] == 'AxiomC' and canon(cmds[i]['arg']) == ''
                and cmds[i+1]['op'] in ('RightLabel', 'RL')
                and cmds[i+2]['op'] == 'UnaryInfC'):
                tag = label_key(cmds[i+1]['arg'])
                if tag in ('n', 'm'):
                    tags.append((tag, canon(cmds[i+2]['arg'])))
        if len(tags) != 2 or {tag for tag, _ in tags} != {'n','m'}:
            error(f"{location}: exists-e schema requires assumptions n and m")
        if canon(root['children'][1]['formula']) != canon(root['formula']):
            error(f"{location}: exists-e minor subderivation must conclude psi")
        if not all(t in label for t in ('n', 'm')):
            error(f"{location}: exists-e label must discharge n,m")
    return [child['formula'] for child in root['children']], root['formula'], root['label']


def restricted_justification(tree: str, schema: dict, mode: str, location: str):
    root, _ = parse_tree(tree, location)
    if canon(root['formula']) != canon(schema['conclusion']):
        error(f"{location}: restricted derivation has wrong conclusion")
    cmds = commands(tree)
    labels = [label_key(c['arg']) for c in cmds if c['op'] in ('RightLabel','RL')]
    required = {'forall-i': ('to','forall'), 'forall-e': ('forall','to'),
                'exists-i': ('land','exists'), 'exists-e': ('land','exists')}[mode]
    # Check the defining proof actually contains the expected primitive rules.
    if not all(('\\' + op) in ''.join(labels) for op in required):
        error(f"{location}: restricted {mode} justification misses expected steps")
    if not any(
        'Def.' in (c['arg'] or '')
        or re.search(r'D\s*\\(?:ref|href)\s*\{', c['arg'] or '')
        for c in cmds if c['op'] in ('RightLabel', 'RL')
    ):
        error(f"{location}: restricted justification must contain a definition step")
    # Retain the authored source as registry provenance. At runtime we graft
    # the actual quantified formulas and full subproof trees, not schematic vdots.
    return tree



def unique_schema(trees: list[str], mode: str, location: str):
    """Validate uniqueness introduction and the unique-existence rules."""
    count = 2 if mode == 'elim' else 1
    if len(trees) != count:
        error(f"{location}: uniqueness-related {mode} needs {count} schematic tree(s)")
    if mode == 'atmost-intro':
        root, _ = parse_tree(trees[0], location)
        if len(root['children']) != 1 or canon(root['children'][0]['formula']) != canon(r'\(a=b\)'):
            error(f"{location}: at-most-one introduction needs a subderivation ending in a=b")
        normalized = label_key(root['label'])
        if normalized != r'\Unique-I,n,m':
            error(f"{location}: at-most-one introduction needs label \\Unique-I, n,m")
        if canon(root['formula']) != canon(r'\(\Unique x\,\varphi(x)\)'):
            error(f"{location}: unexpected at-most-one schematic conclusion")
        return [dict(premises=[root['children'][0]['formula']],
                     conclusion=root['formula'], inferenceLabel=root['label'],
                     variant='atmost-intro')]
    entries = []
    for index, tree in enumerate(trees):
        premises, conclusion, label = schema_from(tree, location)
        expected_arity = 2 if mode == 'intro' else 1
        if len(premises) != expected_arity:
            error(f"{location}: unique-existence {mode} requires {expected_arity} premises")
        normalized = label_key(label)
        if r'\exists!' + ('-I' if mode == 'intro' else '-E') not in normalized:
            error(f"{location}: wrong inference label for unique-existence {mode}: {label!r}")
        entries.append(dict(premises=premises, conclusion=conclusion, inferenceLabel=label,
                            variant=('intro' if mode == 'intro' else
                                     ('existence' if index == 0 else 'atmostone'))))
    return entries


def unique_justification(trees: list[str], schemata: list[dict], location: str):
    if len(trees) != len(schemata):
        error(f"{location}: unique-existence justification count mismatch")
    output = []
    for tree, schema in zip(trees, schemata):
        if schema['variant'] == 'atmost-intro':
            root, _ = parse_tree(tree, location)
            labels = [c['arg'] for c in commands(tree) if c['op'] in ('RightLabel', 'RL')]
            if (canon(root['formula']) != canon(schema['conclusion'])
                or not any(r'D\ref{def:uniqueness}' in label for label in labels)
                or sum(r'\to' in label and '-I' in label for label in labels) != 2
                or sum(r'\forall' in label and '-I' in label for label in labels) != 2):
                error(f"{location}: at-most-one justification must show definition, "
                      "two implication introductions and two universal introductions")
            output.append(tree)  # Runtime substitutes the complete actual subderivation.
            continue
        template = proof_template(tree, schema['premises'], schema['conclusion'], location)
        labels = [c['arg'] for c in commands(tree) if c['op'] in ('RightLabel', 'RL')]
        if not any(r'D\ref{def:unique-existence}' in lab for lab in labels):
            error(f"{location}: unique-existence justification must cite its definition")
        needed = ('-I' if schema['variant'] == 'intro' else '-E')
        if not any(r'\land' in lab and needed in lab for lab in labels):
            error(f"{location}: justification must contain {needed}")
        output.append(template)
    return output

def get_proposition_proofs(path: Path, content: str, targets):
    entries = {}
    props = list(PROPOSITION.finditer(content))
    for match in PROP_ANNOTATION.finditer(content):
        loc = f"{path.relative_to(ROOT)}:{content.count(chr(10), 0, match.start()) + 1}"
        key, vars_, fresh = proposition_annotation(match.group(1), loc)
        prior = next((m for m in reversed(props) if m.end() < match.start()), None)
        if not prior:
            error(f"{loc}: no preceding proposition")
        lbl = re.search(r"\\label\s*\{(prop:[^{}\s]+)\}", prior.group(1))
        if not lbl or lbl.group(1) != key:
            error(f"{loc}: proposition annotation is not following {key}")
        after = content[match.end():]
        env = re.match(r"\s*\\begin\s*\{formalderivation\}(?:\[[^\]]*\]){0,2}", after)
        if env:
            environment = 'formalderivation'
        else:
            # For a theorem with a separately authored complete tree, the
            # annotation belongs immediately above explorerderivation.
            env = re.match(r"\s*\\begin\s*\{explorerderivation\}\s*\{[^{}]+\}", after)
            if not env:
                error(f"{loc}: proposition annotation must immediately precede "
                      "formalderivation or explorerderivation")
            environment = 'explorerderivation'
        end = re.search(r"\\end\s*\{" + environment + r"\}", after[env.end():])
        if not end:
            error(f"{loc}: unclosed {environment}")
        trees = TREE.findall(after[env.end():env.end() + end.start()])
        if len(trees) != 1:
            error(f"{loc}: proposition proof must contain one prooftree")
        variants = proof_prop_variants(trees[0], loc)
        for variant in variants:
            variant['template'] = resolve_label(variant['template'], targets, loc)
        if key in entries:
            error(f"Duplicate proposition registration {key}")
        number, url = targets[key]
        entries[key] = dict(id=key, vars=vars_, fresh=fresh,
                            number=number, url=f"{url}#{key}",
                            variants=variants)
    return entries


# Result dependencies are an index of *authored citations*, independent of
# whether an Explorer proof is visually expanded. This is not a proof checker.
_RESULT_ENV = re.compile(
    r'\\begin\s*\{(axiom|proposition|theorem|lemma|corollary)\}'
    r'(?:\[([^\]]*)\])?(.*?)\\end\s*\{\1\}', re.S)
_RESULT_LABEL = re.compile(r'\\label\s*\{([^{}]+)\}')
_PROOF_ENV = re.compile(r'\\begin\s*\{proof\}(?:\[[^\]]*\])?(.*?)\\end\s*\{proof\}', re.S)
_STRUCTURE_BREAK = re.compile(r'\\(?:section|subsection|subsubsection|nbgpara|nbgparar)\b')
_AXIOM_LABEL = re.compile(r'^A_?\{?(\d+)\}?$')


def _result_citations(body: str) -> list[str]:
    """Return explicit references (not implicit mathematical dependencies)."""
    ids = set()
    # References in a proof's prose and its authored trees may both be genuine.
    for ref in REF.findall(body):
        if ref.startswith(('prop:', 'th:', 'thm:', 'lem:', 'lemma:', 'cor:', 'ax:', 'axiom:')):
            ids.add(ref)
    for tree in TREE.findall(body):
        for cmd in commands(tree):
            if cmd['op'] not in ('RightLabel', 'RL'):
                continue
            name = label_key(cmd['arg'])
            name = re.sub(r'\\mathrm\s*\{A\}|\\mathrm\s+A', 'A', name)
            ax = _AXIOM_LABEL.fullmatch(name)
            if ax:
                ids.add('axiom:number:' + ax.group(1))
    return sorted(ids)


def dependency_index(tex_paths: list[Path], targets: dict):
    """An optional, conservative citation graph for the dependency sidebar.

    Store only references actually written in the theorem's proof. When a
    theorem has no explicit citations or lacks an accessible formal proof,
    no dependencies are invented. An axiom's A-number can be linked to its
    labeled source when unambiguous in the generated reference index.
    """
    index = {}
    axioms = {}
    for path in tex_paths:
        source = path.read_text(encoding='utf-8')
        statements = list(_RESULT_ENV.finditer(source))
        for n, match in enumerate(statements):
            kind, heading, content = match.groups()
            label = _RESULT_LABEL.search(content)
            if not label:
                continue
            key = label.group(1)
            if key not in targets:
                continue
            number, file = targets[key]
            title = re.sub(r'\\(?:textbf|emph)\s*\{([^{}]*)\}', r'\1', heading or '')
            title = re.sub(r'\\[A-Za-z]+|[{}]', '', title).strip() or kind.title()
            entry = dict(id=key, kind=kind, title=title, number=number,
                         url=f'{file}#{key}', requires=[])
            # A leading-number axiom is also addressable by the A_N label.
            if kind == 'axiom':
                index[key] = entry
                number_string = str(number)
                ax_number = re.fullmatch(r'\d+', number_string)
                if ax_number and number_string not in axioms:
                    axioms[number_string] = entry
                continue
            end = statements[n+1].start() if n+1 < len(statements) else len(source)
            trailing = source[match.end():end]
            barrier = _STRUCTURE_BREAK.search(trailing)
            if barrier:
                trailing = trailing[:barrier.start()]
            proof = _PROOF_ENV.search(trailing)
            if proof:
                entry['requires'] = [dep for dep in _result_citations(proof.group(1))
                                     if dep != key]
            index[key] = entry
    # Unreferenced numbered axioms are still added by the live proof scanner.
    # Map ordinary A_N labels to axiom entries only when their numbering agrees.
    return dict(results=index, axioms=axioms)


def main():
    schemata = {}
    expansions = {}
    tex_paths = [
        path for path in sorted(ROOT.rglob("*.tex"))
        if "site" not in path.parts and path.name != "main_html.tex"
    ]
    annotated_options = {}
    for path in tex_paths:
        content = path.read_text(encoding="utf-8")
        for match in ANNOTATION.finditer(content):
            location = f"{path.relative_to(ROOT)}:{content.count(chr(10), 0, match.start()) + 1}"
            key, vars_, fresh, kind, tag, eigen, locals_, mode = annotation(match.group(1), location)
            if key in annotated_options:
                error(f"Duplicate expansion annotation for {key}")
            annotated_options[key] = {"vars": vars_, "fresh": fresh,
                                      "kind": kind, "discharge": tag, "eigen": eigen, "locals": locals_, "mode": mode}

    for path in tex_paths:
        content = path.read_text(encoding="utf-8")
        for match in DERIVED.finditer(content):
            label_match = re.search(r"\\label\s*\{(rule:[^{}\s]+)\}", match.group(2))
            if not label_match:
                continue
            key = label_match.group(1)
            if key not in annotated_options:
                continue
            rule_trees = TREE.findall(match.group(2))
            if len(rule_trees) != (2 if annotated_options[key]["kind"] == "unique" and annotated_options[key]["mode"] == "elim" else 1):
                error(f"{path}:{content.count(chr(10), 0, match.start())+1}: rule {key} has unexpected schematic tree count")
            kind = annotated_options[key]["kind"]
            assumption = None
            if kind == "unique":
                if key in schemata:
                    error(f"Duplicate rule identifier {key}")
                schemata[key] = unique_schema(rule_trees, annotated_options[key]["mode"], key)
                continue
            if kind == "restricted":
                mode = annotated_options[key]["mode"]
                premises, conclusion, inf_label = restricted_schema(rule_trees[0], mode, key)
            elif kind == "subproof":
                premises, conclusion, inf_label, assumption = schema_from_subproof(
                    rule_trees[0], annotated_options[key]["discharge"], key
                )
            else:
                premises, conclusion, inf_label = schema_from(rule_trees[0], key)
            if key in schemata:
                error(f"Duplicate rule identifier {key}")
            schemata[key] = {"display": match.group(1) or inf_label or key,
                             "premises": premises, "conclusion": conclusion,
                             "inferenceLabel": inf_label, "assumption": assumption}
        for match in ANNOTATION.finditer(content):
            location = f"{path.relative_to(ROOT)}:{content.count(chr(10), 0, match.start()) + 1}"
            key, vars_, fresh, kind, tag, eigen, locals_, mode = annotation(match.group(1), location)
            after = content[match.end():]
            env = re.match(r"\s*\\begin\s*\{formalderivation\}(?:\[[^\]]*\]){0,2}", after)
            if not env:
                error(f"{location}: annotation must be immediately before a formalderivation")
            form = after[env.end():]
            end = re.search(r"\\end\s*\{formalderivation\}", form)
            if not end:
                error(f"{location}: cannot find closing formalderivation")
            trees = TREE.findall(form[:end.start()])
            if len(trees) != (2 if kind == "unique" and mode == "elim" else 1):
                error(f"{location}: justification has unexpected prooftree count")
            if key in expansions:
                error(f"Duplicate expansion annotation for {key}")
            expansions[key] = {"vars": vars_, "fresh": fresh, "kind": kind,
                               "discharge": tag, "eigen": eigen, "locals": locals_, "tree": trees[0],
                               "location": location, "mode": mode,
                               "trees": trees}

    if not expansions:
        error("No proof-explorer-expansion annotations found in *.tex")
    targets = reference_index()
    registry = {}
    propositions = {}
    for path in tex_paths:
        for key, entry in get_proposition_proofs(path, path.read_text(encoding="utf-8"), targets).items():
            if key in propositions:
                error(f"Duplicate proposition registration {key}")
            propositions[key] = entry
    for key, expansion in expansions.items():
        if key not in schemata:
            error(f"{expansion['location']}: no derivedrule with \\label{{{key}}}")
        schema = schemata[key]
        if expansion["kind"] == "unique":
            templates = unique_justification(expansion["trees"], schema, expansion["location"])
            for variant, template in zip(schema, templates):
                suffix = '' if variant['variant'] == 'intro' else ':' + variant['variant']
                entry_key = key + suffix
                registry[entry_key] = dict(
                    id=entry_key, label=variant['inferenceLabel'], vars=[], fresh=[],
                    premises=variant['premises'], conclusion=variant['conclusion'],
                    template=resolve_label(template, targets, expansion['location']),
                    kind='unique', mode=expansion['mode'],
                    variant=variant['variant'], locals=[],
                    definitionLabel=resolve_label(
                        r'D\ref{def:uniqueness}' if variant['variant'] == 'atmost-intro'
                        else r'D\ref{def:unique-existence}',
                        targets, expansion['location']
                    )
                )
            continue
        # The theorem heading may use different typography from the inference label.
        # Match applications using the actual RightLabel, not the heading text.
        if expansion["kind"] == "restricted":
            template = restricted_justification(expansion["tree"], schema,
                                                expansion["mode"], expansion["location"])
        elif expansion["kind"] == "subproof":
            template = proof_template_subproof(
                expansion["tree"], schema["premises"][0], schema["assumption"],
                schema["conclusion"], expansion["discharge"], key
            )
        else:
            template = proof_template(
                expansion["tree"], schema["premises"], schema["conclusion"], key
            )
        template = resolve_label(template, targets, expansion["location"])
        template = freshen_local_template_labels(
            template, expansion["locals"], expansion["location"]
        )
        entry = {
            "id": key, "label": schema["inferenceLabel"], "vars": expansion["vars"],
            "fresh": expansion["fresh"], "premises": schema["premises"],
            "conclusion": schema["conclusion"], "template": template,
            "kind": expansion["kind"], "locals": expansion["locals"]
        }
        if expansion["kind"] == "restricted":
            entry["mode"] = expansion["mode"]
        if expansion["kind"] == "subproof":
            entry["assumption"] = schema["assumption"]
            entry["discharge"] = expansion["discharge"]
            entry["eigen"] = expansion["eigen"]
        registry[key] = entry

    for i, entry in enumerate(registry.values()):
        for other in list(registry.values())[:i]:
            if label_key(entry['label']) == label_key(other['label']) and not (
                entry['kind'] == other['kind'] == 'unique' and
                entry['mode'] == other['mode'] == 'elim'):
                error("Multiple unrelated registered rules have the same inference label")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    dependencies = dependency_index(tex_paths, targets)
    OUT.write_text(
        json.dumps({"version": 7, "rules": registry, "propositions": propositions,
                    "dependencies": dependencies}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Proof registry: generated {len(registry)} rule(s) "
          f"({sum(len(e['premises']) == 1 and e['kind'] == 'ordinary' for e in registry.values())} unary, "
          f"{sum(len(e['premises']) == 2 for e in registry.values())} binary, "
          f"{sum(e['kind'] == 'subproof' for e in registry.values())} subproof) "
          f"and {len(propositions)} proposition(s) in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"Proof registry error: {exc}", file=sys.stderr)
        sys.exit(1)
