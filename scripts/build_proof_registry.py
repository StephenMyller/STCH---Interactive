#!/usr/bin/env python3
"""Build Proof Explorer v0.7 registry from explicitly annotated LaTeX rules.

Supports unary, binary, and explicitly annotated subderivation rules, with arbitrary branching in
justifications provided each schematic premise appears once as either a direct
AxiomC leaf or a numbered assumption line (AxiomC/RightLabel/UnaryInfC).
Other leaves (e.g. locally discharged assumptions) are preserved.

For a discharge rule, use:
% proof-explorer-expansion: rule:subset-i; vars=A,B,a; fresh=x; kind=subproof; discharge=n; eigen=a
The defining tree must contain a single conventional dotted schematic subproof:
  AxiomC{} / RightLabel{(n)} / UnaryInfC{assumption} / noLine /
  UnaryInfC{vdots} / noLine / UnaryInfC{premise}.
The engine checks the selected discharge assumption and conservatively rejects
applications if the eigenvariable occurs in other assumption leaves.

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
                "tag": canon(block[1]["arg"]),
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
    if not root["label"] or not re.search(
        r",\s*\\\(\s*" + re.escape(tag) + r"\s*\\\)\s*$", root["label"]):
        error(f"{location}: final rule label must end with ', \\({tag}\\)'")
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
        old = tree[cmd["start"]:cmd["end"]]
        marker = re.compile(r"\\\(\s*" + re.escape(tag) + r"\s*\\\)")
        new, count = marker.subn("@@PE_DISCHARGE@@", old)
        if count:
            edits.append((cmd["start"], cmd["end"], new))
            discharge_count += count
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
    if "vars" not in options or not options["vars"]:
        error(f"{location}: specify schematic vars (e.g. vars=A,B,C)")
    if any(k not in ("vars", "fresh", "kind", "discharge", "eigen") for k in options):
        error(f"{location}: unknown annotation field")
    vars_ = [part.strip() for part in options["vars"].split(",") if part.strip()]
    fresh = [part.strip() for part in options.get("fresh", "").split(",") if part.strip()]
    names = vars_ + fresh
    if len(names) != len(set(names)) or any(not VARNAME.fullmatch(name) for name in names):
        error(f"{location}: variables must be distinct single symbols, optionally subscripted")
    kind = options.get("kind", "ordinary")
    if kind not in ("ordinary", "subproof"):
        error(f"{location}: unsupported expansion kind {kind!r}")
    tag = options.get("discharge")
    eigen = options.get("eigen")
    if kind == "subproof" and (not tag or not re.fullmatch(r"[A-Za-z0-9]+", tag)):
        error(f"{location}: kind=subproof requires a single discharge marker, e.g. discharge=n")
    if kind == "subproof" and eigen not in vars_:
        error(f"{location}: kind=subproof requires eigen= naming a schematic variable")
    if kind != "subproof" and (tag or eigen):
        error(f"{location}: discharge=/eigen= are only valid with kind=subproof")
    return key, vars_, fresh, kind, tag, eigen


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
            key, vars_, fresh, kind, tag, eigen = annotation(match.group(1), location)
            if key in annotated_options:
                error(f"Duplicate expansion annotation for {key}")
            annotated_options[key] = {"vars": vars_, "fresh": fresh,
                                      "kind": kind, "discharge": tag, "eigen": eigen}

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
            if len(rule_trees) != 1:
                error(f"{path}:{content.count(chr(10), 0, match.start())+1}: rule {key} needs one schematic prooftree")
            kind = annotated_options[key]["kind"]
            assumption = None
            if kind == "subproof":
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
            key, vars_, fresh, kind, tag, eigen = annotation(match.group(1), location)
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
            expansions[key] = {"vars": vars_, "fresh": fresh, "kind": kind,
                               "discharge": tag, "eigen": eigen, "tree": trees[0],
                               "location": location}

    if not expansions:
        error("No proof-explorer-expansion annotations found in *.tex")
    targets = reference_index()
    registry = {}
    for key, expansion in expansions.items():
        if key not in schemata:
            error(f"{expansion['location']}: no derivedrule with \\label{{{key}}}")
        schema = schemata[key]
        # The theorem heading may use different typography from the inference label.
        # Match applications using the actual RightLabel, not the heading text.
        if expansion["kind"] == "subproof":
            template = proof_template_subproof(
                expansion["tree"], schema["premises"][0], schema["assumption"],
                schema["conclusion"], expansion["discharge"], key
            )
        else:
            template = proof_template(
                expansion["tree"], schema["premises"], schema["conclusion"], key
            )
        template = resolve_label(template, targets, expansion["location"])
        entry = {
            "id": key, "label": schema["inferenceLabel"], "vars": expansion["vars"],
            "fresh": expansion["fresh"], "premises": schema["premises"],
            "conclusion": schema["conclusion"], "template": template,
            "kind": expansion["kind"]
        }
        if expansion["kind"] == "subproof":
            entry["assumption"] = schema["assumption"]
            entry["discharge"] = expansion["discharge"]
            entry["eigen"] = expansion["eigen"]
        registry[key] = entry

    labels = [entry["label"] for entry in registry.values()]
    if len(labels) != len(set(labels)):
        error("Multiple registered rules have the same inference label")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"version": 3, "rules": registry}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Proof registry: generated {len(registry)} rule(s) "
          f"({sum(len(e['premises']) == 1 and e['kind'] == 'ordinary' for e in registry.values())} unary, "
          f"{sum(len(e['premises']) == 2 for e in registry.values())} binary, "
          f"{sum(e['kind'] == 'subproof' for e in registry.values())} subproof) "
          f"in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"Proof registry error: {exc}", file=sys.stderr)
        sys.exit(1)
