#!/usr/bin/env python3
"""Patch tauri.conf.json for Linux distribution builds.

Applies the same changes as patches/tauri-linux-bundle.patch, but robustly:
the static .patch rots whenever upstream bumps the version or reformats the
JSON, while this script merges by key and is idempotent (safe to re-run).

Changes:
  1. bundle.targets          -> ["deb", "rpm", "appimage"] (was "all", which
     would also try macOS/Windows-only bundles)
  2. bundle.createUpdaterArtifacts -> false (fork releases never feed the
     in-app updater, which points at upstream latest.json, so skip the
     TAURI_SIGNING_PRIVATE_KEY flow entirely and build unsigned)
  3. bundle.category         -> "Utility" (desktop-entry category for the
     generated .desktop file; only set when missing)
  4. bundle.shortDescription / bundle.longDescription defaults
     (deb/rpm package descriptions; only set when missing)
  5. bundle.publisher        -> "Writer Computer" (maps to the Maintainer
     field of .deb packages; only set when missing)
  6. bundle.linux            -> deb/rpm runtime depends for x86_64 and
     aarch64 runners (Ubuntu 22.04, webkit2gtk-4.1). Note bundle.linux
     accepts ONLY appimage/deb/rpm subsections — anything else fails
     `tauri build` with "Additional properties are not allowed".
  7. app.windows[0]          -> drop macOS-only keys (windowEffects,
     trafficLightPosition) and set transparent=false so the window works
     under plain X11/Wayland compositors. Updater + fileAssociations are
     left untouched.

Usage:
    python3 scripts/patch-tauri-linux.py [path/to/tauri.conf.json]

Defaults to apps/desktop/src-tauri/tauri.conf.json relative to the repo root.
Exits 0 when the file already matches (no-op), 1 on error.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONF = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "tauri.conf.json"

LINUX_DEPENDS = {
    "deb": [
        "libwebkit2gtk-4.1-0",
        "libgtk-3-0",
        "libayatana-appindicator3-1 | libappindicator3-1",
    ],
    "rpm": [
        "webkit2gtk4.1",
        "gtk3",
        "libappindicator-gtk3",
    ],
}

MAC_ONLY_WINDOW_KEYS = ("windowEffects", "trafficLightPosition")


def patch(conf_path: Path) -> bool:
    try:
        conf = json.loads(conf_path.read_text())
    except FileNotFoundError:
        print(f"Error: not found: {conf_path}", file=sys.stderr)
        return False
    except json.JSONDecodeError as exc:
        print(f"Error: invalid JSON in {conf_path}: {exc}", file=sys.stderr)
        return False

    changed = False

    bundle = conf.setdefault("bundle", {})

    if bundle.get("createUpdaterArtifacts") is not False:
        bundle["createUpdaterArtifacts"] = False
        changed = True

    if bundle.get("targets") != ["deb", "rpm", "appimage"]:
        bundle["targets"] = ["deb", "rpm", "appimage"]
        changed = True

    if not bundle.get("category"):
        bundle["category"] = "Utility"
        changed = True
    if not bundle.get("shortDescription"):
        bundle["shortDescription"] = "A local-first markdown editor."
        changed = True
    if not bundle.get("longDescription"):
        bundle["longDescription"] = (
            "Writer is a local-first markdown editor for plain-text "
            "workflows such as Obsidian vaults, docs repos, and personal wikis."
        )
        changed = True

    linux = bundle.setdefault("linux", {})
    for key, depends in LINUX_DEPENDS.items():
        section = linux.setdefault(key, {})
        existing = section.setdefault("depends", [])
        for dep in depends:
            if dep not in existing:
                existing.append(dep)
                changed = True

    if not bundle.get("publisher"):
        bundle["publisher"] = "Writer Computer"
        changed = True

    windows = (conf.get("app") or {}).get("windows") or []
    if windows:
        main = windows[0]
        for key in MAC_ONLY_WINDOW_KEYS:
            if key in main:
                del main[key]
                changed = True
        if main.get("transparent") is not False:
            main["transparent"] = False
            changed = True

    if changed:
        conf_path.write_text(_dump(conf))
        print(f"Patched {conf_path} for Linux (deb, rpm, appimage).")
    else:
        print(f"No changes needed: {conf_path} already Linux-ready.")
    return True


def _dump(conf: dict) -> str:
    """Serialize with short scalar arrays kept inline, matching repo style."""
    text = json.dumps(conf, indent=2) + "\n"
    pattern = re.compile(r"\[\s*([^\[\]{}]+?)\s*\]")

    def collapse(match: re.Match[str]) -> str:
        items = [line.strip().rstrip(",") for line in match.group(1).splitlines()]
        items = [item for item in items if item]
        inline = "[" + ", ".join(items) + "]"
        if len(inline) <= 60:
            return inline
        return match.group(0)

    return pattern.sub(collapse, text)


def main(argv: list[str]) -> int:
    conf_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_CONF
    return 0 if patch(conf_path) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
