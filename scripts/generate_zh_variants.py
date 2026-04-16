#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate app/domains/dictation/zh_variants.json from OpenCC public data.

Run once to regenerate when you want to refresh the variant mapping.

Source files (manually downloaded from OpenCC repo):
  /tmp/opencc_data/STCharacters.txt   simplified → traditional variants
  /tmp/opencc_data/TSCharacters.txt   traditional → simplified variants

Output:
  app/domains/dictation/zh_variants.json
  Schema: {"<char>": ["<variant1>", "<variant2>", ...]}
  Each entry's value list ALWAYS includes the key itself (so chars_equivalent
  can do `b in mapping[a]` without first checking equality separately).

This script is one-shot — it does NOT run at app startup. The runtime
loads the produced JSON file directly. We commit the JSON to repo so the
runtime has zero external dependencies.

Usage:
    cd <repo root>
    python3 scripts/generate_zh_variants.py
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = REPO_ROOT / "app" / "domains" / "dictation" / "zh_variants.json"

ST_PATH = Path("/tmp/opencc_data/STCharacters.txt")
TS_PATH = Path("/tmp/opencc_data/TSCharacters.txt")


def parse_opencc_file(path: Path) -> dict[str, list[str]]:
    """Parse one of the OpenCC tab-separated files.

    Format per line:  <key_char>\t<value_char1> <value_char2> ...
    Lines starting with # are comments.
    """
    out: dict[str, list[str]] = {}
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t", 1)
            if len(parts) != 2:
                continue
            key = parts[0].strip()
            values = [v for v in parts[1].split(" ") if v]
            if key and values:
                out[key] = values
    return out


def build_variant_groups(
    st: dict[str, list[str]],
    ts: dict[str, list[str]],
) -> dict[str, set[str]]:
    """Merge ST + TS into bidirectional variant groups.

    For each character, compute the set of ALL characters considered
    equivalent to it (including itself, transitively via both directions).

    Two characters x, y are equivalent if any of:
      - x is in ST[y] or y in ST[x]
      - x is in TS[y] or y in TS[x]

    We compute connected components over the union of edges.
    """
    # Adjacency: each char points to all its direct variants
    adj: dict[str, set[str]] = defaultdict(set)
    for k, vs in st.items():
        for v in vs:
            adj[k].add(v)
            adj[v].add(k)
    for k, vs in ts.items():
        for v in vs:
            adj[k].add(v)
            adj[v].add(k)

    # Connected components via simple BFS
    visited: set[str] = set()
    char_to_group: dict[str, set[str]] = {}
    for start in list(adj.keys()):
        if start in visited:
            continue
        component: set[str] = set()
        stack = [start]
        while stack:
            node = stack.pop()
            if node in visited:
                continue
            visited.add(node)
            component.add(node)
            for neighbor in adj[node]:
                if neighbor not in visited:
                    stack.append(neighbor)
        for c in component:
            char_to_group[c] = component
    return char_to_group


def main() -> int:
    if not ST_PATH.exists() or not TS_PATH.exists():
        print(
            f"ERROR: missing input files. Download them first:\n"
            f"  curl -sL https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/STCharacters.txt -o {ST_PATH}\n"
            f"  curl -sL https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/TSCharacters.txt -o {TS_PATH}",
            file=sys.stderr,
        )
        return 1

    st = parse_opencc_file(ST_PATH)
    ts = parse_opencc_file(TS_PATH)
    print(f"Loaded {len(st)} ST entries, {len(ts)} TS entries")

    groups = build_variant_groups(st, ts)
    print(f"Built {len(groups)} char → variant-group entries")

    # Filter out single-char groups (a char that has no variants — wasted space)
    output: dict[str, list[str]] = {}
    for char, group in groups.items():
        if len(group) > 1:
            # Sort for stable output (deterministic builds)
            output[char] = sorted(group)

    print(f"Final mapping size: {len(output)} chars with variants")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    file_size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Wrote {OUTPUT_PATH} ({file_size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
