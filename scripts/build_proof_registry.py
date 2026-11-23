#!/usr/bin/env python3
"""Build the Proof Explorer v0.5 unary-rule registry from annotated TeX.

Only simple unary derived rules are supported. Fail explicitly for unsupported
shapes: silently manufacturing a mathematically incorrect expansion is worse
than leaving an inference unexpandable.

Annotation immediately before a formalderivation:
% proof-explorer-expansion: rule:set-I; vars=a,A; fresh=B

The rule itself must have \\label{rule:set-I} inside a derivedrule environment.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "proof-rules.json"

DERIVED = re.compile(
    r"\\begin\s*\{derivedrule\}(?:\[([^\]]+)\])?(.*?)\\end\s*\{derivedrule\}",
    re.S,
)
ANNOTATION = re.compile(r"^[ \t]*%[ \t]*proof-explorer-expansion:[ \t]*([^\n\r]+)$", re.M)
TREE = re.compile(r"\\begin\s*\{prooftree\}(.*?)\\end\s*\{prooftree\}", re.S)
COMMAND = re.compile(
    r"\\(AxiomC|UnaryInfC|BinaryInfC|TrinaryInfC|QuaternaryInfC|QuinaryInfC|"
    r"RightLabel|RL|LeftLabel|LL|dashedLine|solidLine|noLine|insertBetweenHyps)\b"
)
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
    """Read the bussproofs commands in execution order, with arguments."""
    pos = 0
    result = []
    while match := COMMAND.search(tree, pos):
        op = match.group(1)
        if op in ("dashedLine", "solidLine", "noLine"):
            result.append((op, None))
            pos = match.end()
        else:
            arg, pos = braced(tree, match.end())
            result.append((op, arg))
    return result


def canon(tex: str) -> str:
    tex = tex.strip()
    if tex.startswith(r"\(") and tex.endswith(r"\)"):
        tex = tex[2:-2]
    return re.sub(r"\s+", "", tex)


def schema_from(tree: str, location: str):
    ops = commands(tree)
    stack = []
    label = None
    for op, arg in ops:
        if op in ("RightLabel", "RL"):
            label = arg.strip()
        elif op == "AxiomC":
            stack.append({"formula": arg, "premises": [], "label": None})
            label = None
        elif op.endswith("InfC"):
            arity = {
                "UnaryInfC": 1, "BinaryInfC": 2, "TrinaryInfC": 3,
                "QuaternaryInfC": 4, "QuinaryInfC": 5,
            }[op]
            if len(stack) < arity:
                error(f"{location}: malformed rule schematic prooftree")
            children = stack[-arity:]
            del stack[-arity:]
            stack.append({"formula": arg, "premises": children, "label": label})
            label = None
    if len(stack) != 1:
        error(f"{location}: schematic prooftree did not form one tree")
    root = stack[0]
    if len(root["premises"]) != 1 or root["premises"][0]["premises"]:
        error(f"{location}: v0.5 only supports single-step unary rule schemata")
    return root["premises"][0]["formula"], root["formula"], root["label"]


def proof_steps(tree: str, premise: str, conclusion: str, location: str):
    ops = commands(tree)
    if not ops or ops[0][0] != "AxiomC" or canon(ops[0][1]) != canon(premise):
        error(f"{location}: justification must start with the rule's exact premise as AxiomC")
    steps = []
    pending_label = ""
    line = "solid"
    for op, arg in ops[1:]:
        if op in ("RightLabel", "RL"):
            pending_label = arg.strip()
        elif op in ("dashedLine", "solidLine", "noLine"):
            line = {"dashedLine": "dashed", "solidLine": "solid", "noLine": "none"}[op]
        elif op == "UnaryInfC":
            steps.append({"label": pending_label, "line": line, "conclusion": arg})
            pending_label, line = "", "solid"
        else:
            error(f"{location}: {op} in justification is unsupported by unary registry v0.5")
    if not steps or canon(steps[-1]["conclusion"]) != canon(conclusion):
        error(f"{location}: justification must finish with the schematic conclusion")
    return steps


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
        error(f"{location}: specify schematic vars (e.g. vars=a,A)")
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


def main():
    schemata = {}
    expansions = {}
    for path in sorted(ROOT.rglob("*.tex")):
        if "site" in path.parts or path.name == "main_html.tex":
            continue
        content = path.read_text(encoding="utf-8")
        for match in DERIVED.finditer(content):
            label_match = re.search(r"\\label\s*\{(rule:[^{}\s]+)\}", match.group(2))
            if not label_match:
                continue
            key = label_match.group(1)
            rule_trees = TREE.findall(match.group(2))
            if len(rule_trees) != 1:
                error(f"{path}:{content.count(chr(10), 0, match.start())+1}: rule {key} needs one schematic prooftree")
            premise, conclusion, inf_label = schema_from(rule_trees[0], key)
            if key in schemata:
                error(f"Duplicate rule identifier {key}")
            schemata[key] = {"display": match.group(1) or inf_label or key,
                              "premise": premise, "conclusion": conclusion,
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
        steps = proof_steps(expansion["tree"], schema["premise"], schema["conclusion"], key)
        for step in steps:
            step["label"] = resolve_label(step["label"], targets, expansion["location"])
        registry[key] = {
            "id": key,
            "label": schema["inferenceLabel"],
            "vars": expansion["vars"],
            "fresh": expansion["fresh"],
            "premise": schema["premise"],
            "conclusion": schema["conclusion"],
            "steps": steps,
        }
    labels = [entry["label"] for entry in registry.values()]
    if len(labels) != len(set(labels)):
        error("Multiple registered rules have the same inference label")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"version": 1, "rules": registry}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Proof registry: generated {len(registry)} unary rule(s) in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"Proof registry error: {exc}", file=sys.stderr)
        sys.exit(1)
