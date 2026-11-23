#!/usr/bin/env python3
"""Build Proof Explorer v0.6 registry from explicitly annotated LaTeX rules.

Supports unary and binary derived-rule schemata, with arbitrary branching in
justifications provided each schematic premise appears as exactly one matching
AxiomC leaf. Other leaves (e.g. locally discharged assumptions) are preserved.

Annotation immediately before a formalderivation:
% proof-explorer-expansion: rule:set-I; vars=a,A; fresh=B

This is a proof-exploration tool, NOT a proof checker. It does not verify
assumption discharge, eigenvariable conditions or general substitutions.
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


def canon(tex: str) -> str:
    tex = tex.strip()
    if tex.startswith(r"\(") and tex.endswith(r"\)"):
        tex = tex[2:-2]
    return re.sub(r"\s+", "", tex)


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


def annotation(raw: str, location: str):
    chunks = [part.strip() for part in raw.split(";")]
    key = chunks[0]
    if not re.fullmatch(r"rule:[\w:.-]+", key):
        error(f"{location}: invalid rule identifier {key!r}")
    options = {}
    for chunk in chunks[1:]:
        if "=" not in chunk:
            error(f"{location}: expected key=value metadata after ';'")
        option, value = [s.strip() for s in chunk.split("=", 1)]
        if option in options:
            error(f"{location}: duplicate metadata {option}")
        options[option] = [s.strip() for s in value.split(",") if s.strip()]
    if "vars" not in options or not options["vars"]:
        error(f"{location}: specify schematic vars (e.g. vars=A,B,C)")
    if any(k not in ("vars", "fresh") for k in options):
        error(f"{location}: unknown annotation field")
    names = options["vars"] + options.get("fresh", [])
    if len(names) != len(set(names)) or any(not VARNAME.fullmatch(name) for name in names):
        error(f"{location}: variables must be distinct single symbols, optionally subscripted")
    return key, options["vars"], options.get("fresh", [])


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
    """Insert one placeholder for each schematic premise leaf.

    Does not replace other AxiomC leaves: those may represent local assumptions,
    which remain exactly as the author wrote them. Rejects ambiguous matches.
    """
    root, leaves = parse_tree(tree, location)
    if canon(root["formula"]) != canon(conclusion):
        error(f"{location}: justification must end in the schematic rule conclusion")
    if len({canon(p) for p in premises}) != len(premises):
        error(f"{location}: identical premise formulas are ambiguous in v0.6")
    replacements = []
    for i, premise in enumerate(premises):
        hits = [cmd for leaf, cmd in leaves if canon(leaf["formula"]) == canon(premise)]
        if len(hits) != 1:
            error(f"{location}: premise {i+1} occurs {len(hits)} times as an AxiomC leaf; "
                  "v0.6 requires exactly one occurrence per premise")
        cmd = hits[0]
        replacements.append((cmd["start"], cmd["end"], f"@@PE_PREMISE_{i}@@"))
    template = tree
    for start, end, marker in sorted(replacements, reverse=True):
        template = template[:start] + marker + template[end:]
    return template


def main():
    schemata = {}
    expansions = {}
    tex_paths = [
        path for path in sorted(ROOT.rglob("*.tex"))
        if "site" not in path.parts and path.name != "main_html.tex"
    ]
    annotated_keys = set()
    for path in tex_paths:
        content = path.read_text(encoding="utf-8")
        for match in ANNOTATION.finditer(content):
            annotated_keys.add(match.group(1).split(";", 1)[0].strip())

    for path in tex_paths:
        content = path.read_text(encoding="utf-8")
        for match in DERIVED.finditer(content):
            label_match = re.search(r"\\label\s*\{(rule:[^{}\s]+)\}", match.group(2))
            if not label_match:
                continue
            key = label_match.group(1)
            if key not in annotated_keys:
                continue
            rule_trees = TREE.findall(match.group(2))
            if len(rule_trees) != 1:
                error(f"{path}:{content.count(chr(10), 0, match.start())+1}: rule {key} needs one schematic prooftree")
            premises, conclusion, inf_label = schema_from(rule_trees[0], key)
            if key in schemata:
                error(f"Duplicate rule identifier {key}")
            schemata[key] = {"display": match.group(1) or inf_label or key,
                             "premises": premises, "conclusion": conclusion,
                             "inferenceLabel": inf_label}
        for match in ANNOTATION.finditer(content):
            location = f"{path.relative_to(ROOT)}:{content.count(chr(10), 0, match.start()) + 1}"
            key, vars_, fresh = annotation(match.group(1), location)
            after = content[match.end():]
            env = re.match(r"\s*\\begin\s*\{formalderivation\}(?:\[[^\]]*\]){0,2}", after)
            if not env:
                error(f"{location}: annotation must be immediately before a formalderivation")
            form = after[env.end():]
            end = re.search(r"\\end\s*\{formalderivation\}", form)
            if not end:
                error(f"{location}: cannot find closing formalderivation")
            trees = TREE.findall(form[:end.start()])
            if len(trees) != 1:
                error(f"{location}: justification must contain exactly one prooftree")
            if key in expansions:
                error(f"Duplicate expansion annotation for {key}")
            expansions[key] = {"vars": vars_, "fresh": fresh, "tree": trees[0], "location": location}

    if not expansions:
        error("No proof-explorer-expansion annotations found in *.tex")
    targets = reference_index()
    registry = {}
    for key, expansion in expansions.items():
        if key not in schemata:
            error(f"{expansion['location']}: no derivedrule with \\label{{{key}}}")
        schema = schemata[key]
        if schema["display"].strip() != schema["inferenceLabel"]:
            error(f"{key}: derivedrule title and Gentzen inference label disagree")
        template = proof_template(
            expansion["tree"], schema["premises"], schema["conclusion"], key
        )
        template = resolve_label(template, targets, expansion["location"])
        registry[key] = {
            "id": key, "label": schema["inferenceLabel"], "vars": expansion["vars"],
            "fresh": expansion["fresh"], "premises": schema["premises"],
            "conclusion": schema["conclusion"], "template": template,
        }
    labels = [entry["label"] for entry in registry.values()]
    if len(labels) != len(set(labels)):
        error("Multiple registered rules have the same inference label")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"version": 2, "rules": registry}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    kinds = {len(entry['premises']) for entry in registry.values()}
    print(f"Proof registry: generated {len(registry)} rule(s) "
          f"({sum(len(e['premises']) == 1 for e in registry.values())} unary, "
          f"{sum(len(e['premises']) == 2 for e in registry.values())} binary) "
          f"in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"Proof registry error: {exc}", file=sys.stderr)
        sys.exit(1)
