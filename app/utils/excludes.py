import os

EXCLUDE_PRESETS = [
    {"id": "caches", "label": "Caches and thumbnails",
     "patterns": ["**/.cache", "**/cache", "**/thumbs", "**/.thumbnails"]},
    {"id": "temp", "label": "Temporary files",
     "patterns": ["**/*.tmp", "**/*.temp", "**/*.swp", "**/*.part", "**/~$*", "**/.~lock.*"]},
    {"id": "node_modules", "label": "node_modules folders", "patterns": ["**/node_modules"]},
    {"id": "trash", "label": "Trash folders",
     "patterns": ["**/.Trash*", "**/.recycle", "**/#recycle", "**/@Recycle", "**/$RECYCLE.BIN"]},
]
PRESET_IDS = {preset["id"] for preset in EXCLUDE_PRESETS}


def validate_presets(presets: list[str]) -> list[str]:
    unknown = [p for p in presets if p not in PRESET_IDS]
    if unknown:
        raise ValueError(f"Unknown exclude presets: {', '.join(unknown)}")
    return list(dict.fromkeys(presets))


def validate_patterns(patterns: list[str]) -> list[str]:
    cleaned = [p.strip() for p in patterns]
    if any(not p for p in cleaned):
        raise ValueError("Exclude patterns must not be empty")
    return list(dict.fromkeys(cleaned))


def exclude_args(source: str, presets: list[str], patterns: list[str]) -> list[str]:
    """`--exclude` options for rdiff-backup.

    rdiff-backup matches globs against absolute paths and aborts on patterns that cannot match the
    source, so patterns not starting with `**` are anchored at the source root.
    """
    globs = [g for preset in EXCLUDE_PRESETS if preset["id"] in presets for g in preset["patterns"]]
    root = os.path.normpath(source)
    for pattern in patterns:
        if not pattern.startswith("**") and not pattern.startswith(root + "/"):
            pattern = f"{root}/{pattern.lstrip('/')}"
        globs.append(pattern)
    return [arg for glob in dict.fromkeys(globs) for arg in ("--exclude", glob)]
