#!/usr/bin/env python3
"""Fix the textbook's narrow-viewport layout without replacing existing JS.

Run from the repository root: python3 apply_responsive_fix.py
Changes only assets/gentzen-panel.css and one breakpoint in assets/gentzen.js.
Creates .bak copies on the first run and fails without modifying anything
if the expected original structure is not present.
"""
from pathlib import Path
import sys

css_path = Path('assets/gentzen-panel.css')
js_path = Path('assets/gentzen.js')
if not css_path.is_file() or not js_path.is_file():
    sys.exit('Run from your textbook repository root: assets/gentzen-panel.css and assets/gentzen.js must exist.')

css = css_path.read_text(encoding='utf-8')
js = js_path.read_text(encoding='utf-8')

# Exactly these five layout media queries must move together. Other styles,
# including the desktop proof tree and Explorer, are untouched.
if css.count('min-width: 1600px') == 5 and css.count('max-width: 1599px') == 2:
    new_css = css.replace('min-width: 1600px', 'min-width: 1360px')
    new_css = new_css.replace('max-width: 1599px', 'max-width: 1359px')
    new_css = new_css.replace('1600 CSS pixels', '1360 CSS pixels')
    new_css = new_css.replace('801px and 1599px', '801px and 1359px')
    new_css = new_css.replace('narrower than 1600px', 'narrower than 1360px')
elif css.count('min-width: 1360px') == 4 and css.count('max-width: 1359px') == 2:
    new_css = css
else:
    sys.exit('CSS breakpoints differ from the expected source; no files changed. Inspect before patching.')

# This source already has an important override that restores scrolling on
# large monitors. Make it apply *except when* the full Proof Explorer is open.
# The :not() guard is essential: Explorer intentionally locks document scroll.
old_scroll = '''@media screen and (min-width: 1360px) {

  html body {
    overflow-y: auto !important;
  }
}'''
new_scroll = '''/* Normal textbook reading must scroll at EVERY screen width.
   Do not interfere with the full-screen Proof Explorer's scroll lock. */
html:not(.proof-explorer-mode),
html:not(.proof-explorer-mode) body {
  overflow-y: auto !important;
}'''
if new_css.count(old_scroll) == 1:
    new_css = new_css.replace(old_scroll, new_scroll)
elif new_css.count(new_scroll) != 1:
    sys.exit('Expected scroll-restoration block not found; no files changed.')

old_js = 'window.innerWidth < 1600'
new_js = 'window.innerWidth < 1360'
if js.count(old_js) == 1:
    new_js_text = js.replace(old_js, new_js)
elif js.count(new_js) == 1:
    new_js_text = js
else:
    sys.exit('Gentzen panel alignment breakpoint differs; no files changed.')

for path, original, revised in ((css_path, css, new_css), (js_path, js, new_js_text)):
    if original == revised:
        print(f'Already fixed: {path}')
        continue
    backup = path.with_name(path.name + '.bak')
    if not backup.exists():
        backup.write_text(original, encoding='utf-8')
    path.write_text(revised, encoding='utf-8')
    print(f'Patched: {path} (original backup: {backup})')
print('Done. Commit and push the two patched assets to republish.')
