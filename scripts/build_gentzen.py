#!/usr/bin/env python3
"""Assemble the authored Gentzen JavaScript parts without changing their order.

The .part.js files deliberately share one JavaScript scope. They are SOURCE
sections, not independent browser ES modules. The published gentzen.js is the
unchanged concatenation, so there is no asynchronous loading or import order.
"""

import argparse
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / "scripts" / "gentzen-src"
TARGET = ROOT / "assets" / "gentzen.js"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def assemble() -> tuple[bytes, list[str]]:
    manifest = PARTS / "manifest.txt"
    if not manifest.is_file():
        raise ValueError(f"Missing module list: {manifest}")
    names = [name.strip() for name in manifest.read_text(encoding="utf-8").splitlines()
             if name.strip() and not name.lstrip().startswith("#")]
    if len(names) < 2 or len(set(names)) != len(names):
        raise ValueError("Invalid, incomplete, or repeated Gentzen module names")
    expected = set(names)
    actual = {path.name for path in PARTS.glob("*.part.js")}
    if expected != actual:
        raise ValueError(f"Gentzen module mismatch: missing {sorted(expected - actual)}, "
                         f"unlisted {sorted(actual - expected)}")
    fragments = []
    for name in names:
        if Path(name).name != name or not name.endswith(".part.js"):
            raise ValueError(f"Unsafe module filename: {name}")
        contents = (PARTS / name).read_bytes()
        if not contents:
            raise ValueError(f"Empty module: {name}")
        fragments.append(contents)
    return b"".join(fragments), names


def syntax_check(source: bytes) -> None:
    # Node checks the BUNDLED file: individual sections can begin/end within
    # the long-lived expansion IIFE and need not parse as standalone scripts.
    with tempfile.TemporaryDirectory(prefix="stch-gentzen-") as temp:
        temp_file = Path(temp) / "gentzen.js"
        temp_file.write_bytes(source)
        result = subprocess.run(["node", "--check", str(temp_file)],
                                capture_output=True, text=True, check=False)
        if result.returncode:
            raise ValueError("Bundled Gentzen JavaScript is invalid:\n" + result.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--verify", action="store_true",
                       help="Check the modules reproduce the existing gentzen.js byte for byte")
    group.add_argument("--write", action="store_true",
                       help="Build assets/gentzen.js from the modules for publication")
    args = parser.parse_args()

    content, names = assemble()
    syntax_check(content)
    print(f"Gentzen: {len(names)} modules, {len(content):,} bytes; "
          f"SHA256 {digest(content)}")

    if args.verify:
        if not TARGET.exists():
            raise ValueError(f"Cannot compare: missing original {TARGET}")
        old = TARGET.read_bytes()
        if content != old:
            raise ValueError(
                "SAFETY CHECK FAILED: modules do not reproduce the currently "
                "committed assets/gentzen.js. No files have been changed.\n"
                f"Current file: {digest(old)} ({len(old):,} bytes)\n"
                f"Modules:      {digest(content)} ({len(content):,} bytes)\n"
                "The monolithic file may have changed since the modules were "
                "prepared. Do not overwrite it; regenerate modules from the "
                "latest source first."
            )
        print("PASS: byte-for-byte identical to committed assets/gentzen.js")
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_bytes(content)
        print(f"BUILT: {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(f"GENTZEN ERROR: {error}", file=sys.stderr)
        sys.exit(1)
