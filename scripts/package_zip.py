#!/usr/bin/env python3
"""
Package the Alpaca Trading Committee project as a ZIP for download.
Excludes node_modules, .next, .git, db files, .env, logs, etc.
"""

import os
import zipfile
import sys
from pathlib import Path

SRC = Path("/home/z/my-project")
OUT = Path("/home/z/my-project/download/alpaca-trading-committee.zip")

# Patterns / directories / files to exclude
EXCLUDE_DIRS = {
    "node_modules",
    ".next",
    ".git",
    ".vscode",
    ".idea",
    "upload",
    "download",
    "tests",
    "examples",
    ".zscripts",
}

EXCLUDE_FILES = {
    ".env",
    ".env.local",
    ".z-ai-config",
    ".zipignore",
    ".DS_Store",
    "alpaca_doc.txt",  # input doc, not part of the project
}

EXCLUDE_FILE_PATTERNS = [
    ".db",
    ".db-journal",
    ".log",
    ".png",
    ".webm",
    ".zip",
]

INCLUDE_FILES = {
    "README.md",
    "package.json",
    "bun.lock",
    "next.config.ts",
    "tsconfig.json",
    "tailwind.config.ts",
    "postcss.config.mjs",
    "eslint.config.mjs",
    "components.json",
    "Caddyfile",
    ".env.example",
    ".gitignore",
}

# Directories to walk (only top-level project dirs we want)
WALK_DIRS = [
    "src",
    "prisma",
    "public",
    "scripts",
]


def should_exclude(name: str, is_dir: bool) -> bool:
    if is_dir and name in EXCLUDE_DIRS:
        return True
    if not is_dir and name in EXCLUDE_FILES:
        return True
    if not is_dir:
        for pat in EXCLUDE_FILE_PATTERNS:
            if name.endswith(pat):
                return True
    return False


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        OUT.unlink()

    file_count = 0
    total_size = 0

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        # Top-level files (explicitly included)
        for fname in sorted(INCLUDE_FILES):
            fpath = SRC / fname
            if fpath.exists() and fpath.is_file():
                zf.write(fpath, arcname=fname)
                file_count += 1
                total_size += fpath.stat().st_size
                print(f"  + {fname}")

        # Walk selected directories
        for top in WALK_DIRS:
            top_path = SRC / top
            if not top_path.exists():
                continue
            for root, dirs, files in os.walk(top_path):
                # Filter dirs in-place to prevent descent
                dirs[:] = [d for d in dirs if not should_exclude(d, True)]
                for f in files:
                    if should_exclude(f, False):
                        continue
                    full = Path(root) / f
                    rel = full.relative_to(SRC)
                    zf.write(full, arcname=str(rel))
                    file_count += 1
                    total_size += full.stat().st_size
                    print(f"  + {rel}")

    zip_size = OUT.stat().st_size
    print()
    print(f"Files:    {file_count}")
    print(f"Source:   {total_size:,} bytes")
    print(f"Zip:      {zip_size:,} bytes  ({zip_size/1024:.1f} KB)")
    print(f"Output:   {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
