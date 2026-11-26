# STCH—Interactive

**An interactive, LaTeX-authored textbook on class theory and its logical foundations.**  
[Source repository](https://github.com/StephenMyller/STCH---Interactive) · [Published textbook](https://stephenmyller.github.io/STCH---Interactive/)

> **Maintainer / future-assistant briefing — updated 27 November 2026.**
>
> This README is intended to give a future ChatGPT session (or a human programmer) enough context to work safely without reconstructing the project from past conversations. It records the architecture installed and tested on 26 November 2026. **Before editing, inspect the current repository:** this document is a handover, not a substitute for the actual source. The descriptions of the final publishing workflow and JavaScript modularization are grounded in the complete workflow and file package used for the successful installation, together with the maintainer's confirmation that the live site works. A live repository fetch was unavailable while drafting this README, so do not treat it as an independently verified inventory of later commits.

## 1. Read this first (especially if you are an AI assistant)

The maintainer is comfortable with **LaTeX, formal logic, Gentzen derivations, and mathematical foundations**, but does not normally write Python, JavaScript, or GitHub Actions YAML. They can upload, replace, and commit files in GitHub and inspect Actions logs. They prefer **complete replacement files with exact repository paths** over small, context-dependent patches. Avoid unexplained programming jargon, elaborate infrastructure, and repeated build experiments when a local check is possible.

**Current, user-confirmed state:**

- The **production** GitHub Pages publisher is `.github/workflows/publish.yml`. It uses **direct insertion of the authored `explorerderivation` TeX**, *not* separate Lwarp proof compilations. It does still use Lwarp to compile a lightweight textbook skeleton **on a skeleton-cache miss**.
- JavaScript is authored in **11 source sections** under `scripts/gentzen-src/`, joined in `manifest.txt` order by `scripts/build_gentzen.py --write` during publication. The browser still loads a **single** `assets/gentzen.js`. This is *source-file modularity*, **not** an ES-module refactor or independently scoped components.
- `scripts/build_proof_registry.py` derives the rule/proposition/dependency registry from the author's LaTeX and the generated reference index. `assets/proof-rules.json` is generated build output.
- The full Proof Explorer has been visually checked against the former publisher; in particular Metatheorem D.2 and expansions of **Set-I** and **conjunction congruence (`\land`-Con)**. The modular JavaScript passed a one-time **byte-for-byte equivalence check** against the then-committed `assets/gentzen.js`, and the subsequent modularized production site was confirmed to work.
- There is **no standing comprehensive regression-test suite** installed as part of this effort. A generic one was proposed, then deliberately rejected as disproportionate. Do not claim that automatic proof-expansion tests exist.

**Nonnegotiable approach:** Preserve existing proof trees, mathematical content, expansion behavior, proof geometry, reference links, page layout, and theme functionality unless an explicit change is requested. For the author, **a failed or unexpectedly altered proof is more costly than a slightly slower build**. Prefer small, reversible changes; inspect the real current files; run syntax, equivalence, or focused fixture tests *before* asking the maintainer to spend a GitHub build.

## 2. Purpose and design philosophy

The project is a **reader-facing mathematical textbook**, not a general theorem prover. Mathematical source lives in LaTeX (primarily edited through Overleaf), which produces a conventional manuscript and an HTML presentation via Lwarp. The HTML has a contextual sidebar and a full-window interactive **Gentzen Proof Explorer**. Readers can expand explicitly authored derived rules into more elementary Gentzen derivations and explore rule dependencies and references.

The Explorer **illustrates the logical structure of authored proofs**. It is **not a proof checker** and does not undertake to establish the validity of arbitrary user-entered derivations. Do not introduce a full prover or generic authoring validator without a demonstrated need. The maintainer prefers mathematical modularity: lemmas and derived rules should express natural, reusable mathematical thoughts, with minimal unnecessary dependencies; proofs should be explicit and rigorous, not merely visually convincing.

The intended interface is a **three-column reading layout** where space permits: left table of contents, center mathematical text, and right contextual panel. A theme toggle lives unobtrusively in the Contents heading, and the full Explorer has its own proof viewer, controls, and dependency information. CSS and the reader experience should remain stable through technical refactors.

## 3. Repository map and source-of-truth rules

The most important paths are shown below. This is a **functional map**, not an exhaustive listing of the repository.

```text
STCH---Interactive/
├── main.tex                         LaTeX entry point
├── preamble.tex                     LaTeX definitions and Lwarp integration
├── Chapters/                        Authored mathematical content
├── assets/
│   ├── textbook.css                 Textbook/page layout
│   ├── gentzen-panel.css            Side panel and Explorer styling
│   ├── theme.js                     Theme behavior
│   ├── gentzen.js                   COMPILED JavaScript bundle / historical backup
│   └── proof-rules.json             GENERATED rule registry, not authored by hand
├── scripts/
│   ├── build_proof_registry.py      Generates the proof-rule registry
│   ├── build_gentzen.py             Joins JS source parts; checks assembled syntax
│   └── gentzen-src/
│       ├── manifest.txt             Authoritative concatenation order
│       ├── 01-context-panel.part.js
│       ├── 02-theme-and-navigation.part.js
│       ├── 03-explorer-viewer.part.js
│       ├── 04-full-proof-selection.part.js
│       ├── 05-expansion-formulas.part.js
│       ├── 06-class-builder-and-restricted-rules.part.js
│       ├── 07-quantifier-expansion.part.js
│       ├── 08-rule-discovery.part.js
│       ├── 09-tree-transformation.part.js
│       ├── 10-explorer-expansion-interface.part.js
│       └── 11-standalone-links.part.js
└── .github/workflows/
    └── publish.yml                 Active production publisher
```

**Authoritative authored files:** `Chapters/**/*.tex`, `preamble.tex`, related LaTeX source, the files in `scripts/gentzen-src/`, the stylesheets, `theme.js`, the registry-builder Python script, and the production workflow.

**Derived files:** `assets/gentzen.js` (recreated **within the Actions runner** on every publication), `assets/proof-rules.json` (regenerated by the publishing job), Lwarp-produced HTML, and the assembled `site/` folder. A committed copy of `assets/gentzen.js` can remain as a backup, but **do not edit it to implement changes**: the runner's `build_gentzen.py --write` overwrites that copy for deployment. Likewise, editing `proof-rules.json` is not how to add a derived rule.

Changes made to files in the GitHub runner's temporary checkout are **not committed back to the repository**. This fact is central to the skeleton-generation and source-restoration process below.

## 4. How publication actually works (current architecture)

The production workflow is triggered by pushes to `main` or `master` and can also be started manually with `workflow_dispatch`. It has a `publish` job followed by a GitHub Pages `deploy` job; it uses a concurrency group to avoid racing deployments.

The order of the following operations matters:

1. **Check out the repository.** The Actions runner receives a temporary copy of the complete manuscript and scripts.
2. **Extract original full Explorer trees.** For each `\begin{explorerderivation}{ID} … \end{explorerderivation}` in `Chapters/**/*.tex`, Python records the proof's original `prooftree` source and identity in temporary JSON, including source fingerprint and inference-command count. **Only inside the temporary checkout**, it removes the body of each `explorerderivation`, leaving the opening and closing environment as a placeholder.
3. **Fingerprint and restore the lightweight textbook skeleton.** The skeleton cache key hashes relevant tracked-in-working-tree LaTeX/configuration/image files *after the Explorer bodies have been removed*. Thus editing **only** a full Explorer proof should leave the skeleton key unchanged. The cache currently uses the `stch-book-skeleton-v1-…` namespace; inspect `publish.yml` rather than hard-coding it in new logic.
4. **Compile the skeleton only if its cache is missing.** A cache miss invokes `pdflatex`, multiple Lwarp HTML passes (`lwarpmk html1`, then `lwarpmk html`), `lwarpmk limages`, and SVG-readiness checks. A cache hit skips this expensive process. The cached material is the generated HTML, stylesheet output, and figure assets—not the independently compiled full proofs.
5. **Insert each full proof directly from original TeX.** A Python step finds the matching empty Lwarp HTML `div.explorerderivation`, using its `--explorer-id` marker. It injects the original `\begin{prooftree}…\end{prooftree}` as HTML-escaped text, removing TeX comments and preserving the text for the browser to recover. It verifies coverage and prevents duplicate/missing placements. **No individual proof is compiled through Lwarp in this architecture.**
6. **Resolve mathematical references in those proof trees.** The workflow finds numbered HTML labels/anchors, replaces proof-source `\ref{…}` and `\hyperref[…]{…}` with `\href{…}{…}` links suitable for MathJax, and writes a `gentzen-reference-index` JSON script into the HTML pages. The registry step **depends on this index**. Running registry generation earlier once caused a real staging failure.
7. **Restore the full original LaTeX sources** from `HEAD` in the temporary checkout (`git restore --source=HEAD --worktree -- Chapters`). The skeleton compiler required empty proof bodies; **the registry builder requires the complete originals**. Before continuing, the workflow confirms that the restored sources match the recorded fingerprints.
8. **Build the rule registry** with `python3 scripts/build_proof_registry.py`. It reads authored mathematical annotations and the generated reference index, then writes `assets/proof-rules.json`.
9. **Assemble the modularized JavaScript:** `python3 scripts/build_gentzen.py --write` joins the 11 ordered `*.part.js` files into `assets/gentzen.js` **on the runner** and runs Node's JavaScript syntax check. This step happens **before** website asset versioning and packaging.
10. **Prepare the published assets.** The workflow fixes stylesheet/script paths, ensures essential assets are referenced, appends the commit-based `?v=…` version query for cache busting, copies HTML/CSS/JS/images plus `assets/` into `site/`, and adds `.nojekyll`.
11. **Check essential outputs, upload and deploy.** It checks that every expected proof was placed, the reference index is present, and essential assets and registry exist; then it uploads the `site/` directory to GitHub Pages. **An interrupted/failed build before deployment does not overwrite the live website.**

The expected success summary includes a line of this form:

```text
PUBLISH READY: <N> complete proofs assembled directly from authored TeX;
0 individual Lwarp compilations; skeleton cache HIT
```

`N` is the current number of `explorerderivation` trees; it is **not** fixed at ten for all future editions. On a skeleton cache miss, the summary will say `MISS`, and compilation will take longer.

### Why there are no individual proof caches now

An earlier working design isolated each proof, compiled it separately with Lwarp, and cached the result per proof. That was a large improvement over rebuilding everything, but still involved one Actions job per proof and considerable setup overhead. The subsequent experiment demonstrated that the **authored proof source can be inserted directly** into the already-compiled skeleton and rendered correctly by the Explorer. The author verified the output visually against the earlier site. Consequently, the current architecture has **no per-proof compilation jobs** and **does not use the former per-proof cache**. An edit confined to an Explorer body normally requires only a cached skeleton plus fresh source insertion, reference resolution, registry generation, JS assembly, and deployment.

The trade-off is deliberate: a full Explorer tree is **not independently LaTeX-compiled** on every edit. The pipeline has assembly/coverage checks and the Explorer has its own parser/renderer, but an invalid new proof-source command might appear only when opened in a browser. Do not claim that successful publication certifies the proof's LaTeX or logical validity.

## 5. The Gentzen JavaScript: modular source, one browser script

**This is the most important handoff for future coding work.** The 26 November 2026 refactor split the former large monolithic `gentzen.js` into 11 named **source sections** without modifying its code or runtime behavior. The `manifest.txt` lists them in strict order. Some sections deliberately start or end **inside the same immediately invoked function expression (IIFE)** and therefore **are not individually executable JavaScript files**. They share lexical scope after concatenation. Do **not** try to load them separately with `<script>`, `import`, or `type="module"`, and do not reorder the manifest casually.

| Authored source section | Main responsibility |
| --- | --- |
| `01-context-panel.part.js` | Contextual sidebar: `formalderivation`, figures and supplementary commentary |
| `02-theme-and-navigation.part.js` | Placement/accessibility of the Contents theme toggle and table-of-contents navigation |
| `03-explorer-viewer.part.js` | Full-window viewer, launch controls, zooming/panning and stage |
| `04-full-proof-selection.part.js` | Prefer the separately authored complete `explorerderivation` over an abbreviated sidebar tree |
| `05-expansion-formulas.part.js` | Formula tokenization, matching/substitution, parts of expansion logic |
| `06-class-builder-and-restricted-rules.part.js` | Special class-builder and restricted-rule handling |
| `07-quantifier-expansion.part.js` | Special quantifier / binder expansion handling |
| `08-rule-discovery.part.js` | Recognize rule applications and match them against registry definitions |
| `09-tree-transformation.part.js` | Instantiate and substitute derived derivations into trees |
| `10-explorer-expansion-interface.part.js` | Explorer interaction, rendering, controls, dependency information and registry loading |
| `11-standalone-links.part.js` | Open full derivations that have no corresponding sidebar `formalderivation` |

**Normal change workflow:** edit the relevant `scripts/gentzen-src/*.part.js`; preserve the manifest order and surrounding lexical structure; run the assembler; check the resulting Explorer. The production publisher automatically does the assembly on every build. Do not update the committed `assets/gentzen.js` instead.

Useful commands (in the repository root, with Python and Node installed):

```bash
# Produce the combined asset in the current working tree, checking JS syntax.
python3 scripts/build_gentzen.py --write

# ONLY for a one-time equivalence check against the committed backup:
python3 scripts/build_gentzen.py --verify
```

**Important subtlety:** `--verify` compares the assembled source **byte-for-byte with the existing `assets/gentzen.js`**. On installation, it printed `PASS: byte-for-byte identical to committed assets/gentzen.js`. Once someone **legitimately edits** a `.part.js`, that check is **expected to fail** unless the backup has also been regenerated. It is **not** a permanent regression test. `--write` is the normal compilation command and performs a syntax check; the resulting browser behavior must be checked separately. Do not "repair" a legitimate change merely to make the one-time equivalence test pass.

The one-off `.github/workflows/check-gentzen-modules.yml` was used during the initial migration and can be deleted after successful integration. It is **not required** for current publication. Some other experimental workflows may have been removed as well; do not assume they are still installed.

## 6. The two types of derivation (do not confuse them)

These are **different authoring and presentation roles**, not interchangeable views of the same TeX environment.

### `formalderivation`: contextual side panel

A sidebar `formalderivation` is **pedagogical**. It may show an abbreviated proof, multiple small trees, derived-rule applications, or schematic dots (`\vdots`) where the author judges them appropriate. It must remain easy to read alongside the prose. The surrounding text should explain the mathematical ideas, not mechanically narrate each Gentzen inference.

### `explorerderivation`: full Proof Explorer

An `explorerderivation` is separately authored for the **full Explorer** and carries a stable identifier, e.g.:

```latex
\begin{explorerderivation}{meta:restricted-unrestricted-class-formulation}
  \begin{prooftree}
    % Actual fully explicit Gentzen tree, supplied by the author.
  \end{prooftree}
\end{explorerderivation}
```

**Convention:** Its actual tree is **one completely connected, fully explicit Gentzen proof**, with no omitted subderivations, `\vdots`, schematic placeholders, or compressed inference chains. This is an authoring convention, **not an invitation to add generic validators** the author has not requested. Every assumption leaf should be represented explicitly in the intended proof notation. The `explorerderivation` is hidden on the ordinary manuscript page and displayed by the full-window viewer; it is not the same as the sidebar proof.

**Preservation rule for future assistants:** When the author requests a change to surrounding LaTeX, **never remove, silently replace, truncate, or omit either derivation**. If a complete replacement is requested, include the complete existing `formalderivation` and `explorerderivation` unless the author explicitly asks to change or remove them. Do not use prose or schematic dots to disguise a missing Explorer subderivation.

### Inference typography and notation

- Use the existing `bussproofs`-style Gentzen commands (`\AxiomC`, `\UnaryInfC`, `\BinaryInfC`, `\RightLabel`, etc.) and the project's existing mathematical conventions. **Assumption discharge, eigenvariables, and fresh-variable conditions are mathematically significant**, particularly when expanding derived rules.
- The **derived-domain register** uses upright alphabetic entry labels, e.g. `\Delta a`, `\Delta b`, rather than invented numeric subscripts. Retain the author's established notation.
- The author values natural reusable lemmas, constructive arguments when available, and minimal dependencies. Avoid gratuitous derivation complexity or unnecessary formal verification infrastructure.

## 7. Derived rules, registry, references, and the Explorer

The Explorer's expansion functionality relies on **authored LaTeX annotations** and on the rule registry generated by `scripts/build_proof_registry.py`. The registry can include derived-rule schemata, expansion templates, proposition forwarding, and dependency information. It is **not** a database of mechanically verified theorems.

For orientation, the registry-builder recognizes authoring comments in forms such as:

```latex
% proof-explorer-expansion: rule:set-I; vars=a,A; fresh=B
```

The exact allowed metadata keys and applicability conditions are defined by the **current** `scripts/build_proof_registry.py`; inspect it before introducing a new derived rule. Some rules have specialized expansion semantics (restricted quantifiers, class-builder rules, subproofs/discharge, unique existence, quantifier variants), implemented across the relevant `gentzen-src/` sections. Do not assume every rule is implemented by the generic substitution path.

**Reference-resolution order is critical:** proof HTML must exist; numbered links and the `gentzen-reference-index` must be generated; original complete LaTeX must be restored; **only then** can the registry builder run. An early staging workflow tried to build the registry before generating the index and failed with `No gentzen-reference-index found in generated HTML`. This was fixed; do not reintroduce the old ordering.

**Known good interactive specimen:** Metatheorem D.2, `meta:restricted-unrestricted-class-formulation`, with **Set-I** and **`\land`-Con** expansions. The maintainer checked the initial tree, expanded rules, labels, inference lines, and mathematical references. It is an excellent *manual smoke test* after touching formula substitution, tree transformation, geometry or registry linking. Other mathematical mechanisms need their own examples when changed.

The Explorer also provides zoom/pan/Fit, reversible and nested expansions, reference navigation, and dependency/provenance information. Its display geometry is a deliberately specialized implementation. Earlier attempts to substitute a generic MathJax-only rendering path or different source renderer caused **severe branch overlap, misplaced/oversized `\RightLabel`s, and broken links**, especially during full expansion. **Do not replace the proven renderer or simplify its geometry on intuition alone.** Compare against known-good pages and check *after expanding*, not just the initial tree.

The query parameter `?proof-explorer` is used by the full viewer and the expansion engine. Offline preview index pages in earlier experiments linked first to a textbook page rather than directly opening an Explorer; that link style alone was not a proof failure.

## 8. Routine operating instructions

| If you want to… | Change/check this |
| --- | --- |
| Edit mathematical exposition or a theorem | Edit the appropriate file under `Chapters/` in Overleaf / GitHub; push normally |
| Add or change a full Explorer proof | Edit its `explorerderivation` in the manuscript; confirm its stable identifier; check it in the published Explorer |
| Change an expandable derived rule | Edit the authored rule and its registry annotation; inspect `build_proof_registry.py` and the relevant JS expansion section if new semantics are needed |
| Fix formula matching or variable substitution | Begin in `05-expansion-formulas.part.js` and specialized sections `06`–`09` |
| Fix proof layout or expansion controls | Begin in `03-explorer-viewer.part.js`, `10-explorer-expansion-interface.part.js`, and `assets/gentzen-panel.css` |
| Fix the contextual sidebar or table of contents | Begin in `01-context-panel.part.js`, `02-theme-and-navigation.part.js`, plus CSS |
| Fix light/dark theme behavior | Inspect `assets/theme.js`, `02-theme-and-navigation.part.js`, and theme-related CSS |
| Fix build/caching/deployment | Inspect `.github/workflows/publish.yml` and the Actions logs; do not modify TeX/JS until the failure is localized |
| Change how the combined Gentzen JavaScript is produced | Inspect `scripts/build_gentzen.py`, `scripts/gentzen-src/manifest.txt`, and the `Assemble Gentzen source modules` publishing step |

**Publishing:** Push the files, then use **GitHub → Actions → Publish HTML textbook**. Open the latest run. Check whether the `publish` and `deploy` jobs passed, and inspect the named failing step if not. A push may run automatically; manual `Run workflow` is also available.

**After code changes:** inspect a real published page in Firefox, open D.2 in the Explorer, expand Set-I and `\land`-Con, inspect labels/inference lines, verify a reference link, and use Fit/Undo/Contract as relevant. For theme/navigation changes, check both themes and the Contents heading. Do not confuse a green publication run with proof expansion being visually correct.

**Recovering:** The last successful GitHub Pages deployment remains available if a subsequent build fails before deployment. The known-good `.github/workflows/publish.yml` and older scripts are recoverable from **Git history**. Prefer reverting a narrow change rather than replacing the entire system with an earlier experimental version. If JavaScript fails after a source edit, compare the affected `.part.js`, preserve the manifest order, and check the output of `build_gentzen.py --write` plus browser console errors.

**Cache behavior:** A changed `explorerderivation` body should normally produce a **skeleton cache hit**; a change to ordinary LaTeX, `preamble.tex`, or other hashed skeleton inputs can produce a miss and trigger Lwarp compilation. CSS/JavaScript edits do not require proof compilation. The original, older GitHub Actions per-proof caches may still exist until GitHub evicts them, but the **current** workflow does not consult them.

## 9. What happened on 26 November 2026 (important historical context)

This explains why the current architecture looks unusual and which experiments should **not** be repeated without a reason.

1. **Measured the bottleneck.** Whole-book Lwarp passes were unexpectedly slow because large hidden `explorerderivation` trees were being processed with the manuscript. Removing those bodies from the HTML compilation yielded a much faster **lightweight skeleton**.
2. **Built individually cached proofs.** A first experiment compiled one proof in isolation; a second compiled multiple proof trees in parallel and cached each independently. The author confirmed that independently compiled fragments looked identical to their original presentation. This worked reliably but was more complex than necessary.
3. **Integrated cached proofs into a staging website**, preserving numbered mathematical references and registry generation. An early ordering error built the registry before creating the reference index; it was fixed. The resulting website worked. The per-proof cached production system was tested by editing one proof, then reverting it; GitHub could reuse a previously cached version. Historical observed results: about **7 minutes** for the old full pipeline, about **2 minutes** for a one-proof change with individual compilation, and **74 seconds** to restore/re-publish a fully cached earlier proof. Those numbers belong to the **old caching architecture**, not to the subsequent direct-source system.
4. **Questioned whether isolated Lwarp proof compilation was needed at all.** The experimental workflow inserted the **original TeX `prooftree` source directly** into the cached HTML skeleton. The author compared the resulting Proof Explorers with the established site and reported that they **looked identical**. This removed both individual proof-compilation jobs and their caches from the production pipeline. The latest direct-source publishing architecture is the result.
5. **Audited remaining code complexity.** A generic regression-testing package and generic complete-tree/duplicate-label checks were proposed, but the author preferred not to add them without a concrete problem. The author also reported **no perceptible website loading latency**, so lazy browser loading was set aside. The earlier recommendation to optimize the scaling of hundreds of per-proof cache jobs became **obsolete** when all individual proof jobs were eliminated.
6. **Modularized `gentzen.js` conservatively.** Eleven source sections were extracted in their original order. Their concatenation was **byte-for-byte identical** to the then-committed `assets/gentzen.js`, confirmed by a manual GitHub Actions check with the exact message `PASS: byte-for-byte identical to committed assets/gentzen.js`. The publishing workflow gained a single `Assemble Gentzen source modules` step. The maintainer subsequently confirmed the resulting live site worked. The one-off equivalence workflow is optional and may have been deleted.

The general lesson is **avoid optimizing an expensive step before establishing that the step is necessary**. The simpler direct-injection approach proved more useful than further tuning individual proof caches. Also, distinguish a structural/source refactor from a behavioral change: the 11-section split was consciously *not* a rewrite of the math/renderer architecture.

## 10. Intentional non-goals and deferred work

- **No new generic regression-test framework by default.** The maintainer judged a proposed broad suite overengineered. Introduce a targeted check when a concrete change or recurring bug justifies it; do not claim a suite was adopted.
- **No generic completeness/`\vdots`/premise-count linter solely to police mathematical authorship.** The author writes the proofs. The publishing pipeline already contains narrowly scoped checks needed for assembly and registry production. Do not conflate an authored-proof convention with a request for automated enforcement.
- **No lazy MathJax loading** unless genuine reader-facing latency develops. The maintainer reports effectively instantaneous page use.
- **No individual-proof cache scaling project:** those compilation jobs no longer exist.
- **No unnecessary conversion to ES modules or dynamic imports.** Source modularity is useful now; the current single-script runtime is known to work. A deeper separation into true independent modules would require deliberate interface design and validation and has not been undertaken.
- **No cosmetic rewrite of stylesheet or proof geometry** just for cleanliness. CSS has some accumulated overrides, but its tested appearance takes precedence over theoretical elegance.
- **Potential future cleanup:** the production workflow still embeds sizable Python blocks. Moving them into `scripts/` might improve maintainability, but this was **not** the modularization the maintainer chose; they specifically chose to modularize `gentzen.js`. Do not describe that workflow-Python extraction as completed.

## 11. Instructions for future ChatGPT-assisted maintenance

**Start by looking at the current GitHub repository and the actual files affected.** This README is orientation, not a substitute for source inspection. Preserve both the working website and the mathematical material. Do not rely on outdated files or old experimental workflows when a later production file exists.

The author appreciates rigorous technical explanations but **does not want gratuitous software-engineering process**. State whether a proposed improvement fixes an actual problem or merely addresses a hypothetical risk. Admit uncertainty and correct mistaken assumptions directly. When a change is selected, provide the entire replacement file(s), exact GitHub-relative destinations, clear distinction between **add / replace / retain / delete**, and a focused test plan. Prefer downloading/installing complete files to manually applying brittle snippets. **Never tell the author to replace the entire existing `scripts/` directory** when only new files or subfolders should be added.

For complex changes, do small local or isolated tests (syntax, byte-for-byte reconstruction, controlled HTML fixture, etc.) before recommending a GitHub run. Keep a working production publisher as a rollback. Use a *non-deploying* experiment for uncertain changes to proof-source injection or rendering. Do not promise that syntax checks prove visual correctness. If an experiment fails, fix the specific error rather than repeatedly introducing broad redesigns.

Mathematically, the priority is rigor, explicit Gentzen derivations, meaningful reusable lemmas, and minimal logical dependencies. The prose should communicate the argument naturally. The sidebar proof may abbreviate; the **full Explorer tree must not**. The user sometimes requests entire replacement LaTeX blocks: retain all original trees and unchanged surrounding work, and do not silently "simplify" the mathematics.

When a future architectural change *does* get installed successfully, **update this README**—especially Sections 1, 3–5, 9–10—and record the new source-of-truth paths and verified behavior. That will prevent successive AI sessions from repeatedly rediscovering, or accidentally reversing, the same decisions.
