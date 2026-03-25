"""
Walks files/, parses every .srt file, and emits:
  static/data/episodes.json          — episode metadata array
  static/data/subtitles/<id>.json    — per-episode line arrays
"""
import json
import os
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent.parent
FILES_DIR = ROOT / "files"
OUT_DIR = ROOT / "static" / "data"
SUBTITLES_DIR = OUT_DIR / "subtitles"

TIMESTAMP_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})"
)


def ts_to_seconds(h, m, s, ms) -> float:
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def parse_srt(path: Path) -> list[dict]:
    """Return list of {start, end, text} dicts from an SRT file."""
    lines_out = []
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        text = path.read_text(encoding="utf-8-sig")

    blocks = re.split(r"\n\s*\n", text.strip())
    for block in blocks:
        block_lines = block.strip().splitlines()
        if len(block_lines) < 2:
            continue
        # Find the timestamp line (skip the index line)
        ts_line = None
        text_start = 0
        for i, line in enumerate(block_lines):
            m = TIMESTAMP_RE.search(line)
            if m:
                ts_line = m
                text_start = i + 1
                break
        if ts_line is None:
            continue
        start = ts_to_seconds(ts_line[1], ts_line[2], ts_line[3], ts_line[4])
        end = ts_to_seconds(ts_line[5], ts_line[6], ts_line[7], ts_line[8])
        body = " ".join(
            l.strip() for l in block_lines[text_start:] if l.strip()
        )
        if body:
            lines_out.append({"start": start, "end": end, "text": body})
    return lines_out


def slugify(name: str) -> str:
    """
    Produce a filename-safe slug: keep Hebrew/ASCII letters, digits,
    hyphens, underscores; drop everything else.
    """
    out = []
    for ch in name:
        cat = unicodedata.category(ch)
        if cat.startswith("L") or cat.startswith("N"):
            out.append(ch)
        elif ch in "-_":
            out.append(ch)
        # drop apostrophes, quotes, dots, etc.
    return "".join(out)


def episode_num_from_dir(dirname: str) -> int:
    """Extract numeric episode number from a directory like פרק_042-..."""
    m = re.match(r"פרק_0*(\d+)", dirname)
    return int(m.group(1)) if m else 0


def make_title(dirname: str, ep_num: int) -> str:
    """
    Build a Hebrew display title from the directory name.
    פרק_001-21_12_08  →  פרק 1 — 21.12.08
    פרק_098-פורים_א   →  פרק 98 — פורים א
    פרק_005           →  פרק 5
    """
    # Strip the פרק_NNN prefix
    suffix = re.sub(r"^פרק_0*\d+", "", dirname).lstrip("-")
    if not suffix:
        return f"פרק {ep_num}"
    # Replace underscores with spaces in suffix
    suffix = suffix.replace("_", " ").strip()
    # If suffix looks like a date (digits and dots/spaces only after replacement),
    # join with dots instead of spaces
    suffix = re.sub(r"-?(\d{1,2})[\s_]+(\d{1,2})[\s_]+(\d{2,4})$", "", suffix)
    if not suffix:
        # suffix = f"{date_like.group(1)}.{date_like.group(2)}.{date_like.group(3)}"
        return f"פרק {ep_num}"
    return f"פרק {ep_num} — {suffix}"


def process_regular_episodes() -> list[dict]:
    """Process all פרק_NNN... directories, one SRT per directory."""
    episodes = []
    for ep_dir in sorted(FILES_DIR.iterdir()):
        if not ep_dir.is_dir():
            continue
        dirname = ep_dir.name
        if not dirname.startswith("פרק_"):
            continue

        srts = list(ep_dir.glob("*.srt"))
        if not srts:
            continue
        srt_path = srts[0]

        ep_num = episode_num_from_dir(dirname)
        ep_id = slugify(dirname)
        title = make_title(dirname, ep_num)
        subtitle_file = f"subtitles/{ep_id}.json"

        lines = parse_srt(srt_path)
        SUBTITLES_DIR.mkdir(parents=True, exist_ok=True)
        (SUBTITLES_DIR / f"{ep_id}.json").write_text(
            json.dumps(lines, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        episodes.append(
            {
                "id": ep_id,
                "title": title,
                "num": ep_num,
                "subtitle_file": subtitle_file,
            }
        )
        print(f"  {ep_id}: {len(lines)} lines")

    return episodes


def process_2020_episodes() -> list[dict]:
    """Process Comedy_Store_2020/ — individual ep files only."""
    ep2020_dir = FILES_DIR / "Comedy_Store_2020"
    if not ep2020_dir.exists():
        return []

    episodes = []
    # Match only comedy_store_2020_epN.srt (skip the combined ComedyStore_2020_e1-3.srt)
    for srt_path in sorted(ep2020_dir.glob("comedy_store_2020_ep*.srt")):
        m = re.search(r"ep(\d+)", srt_path.stem)
        if not m:
            continue
        ep_num = int(m.group(1))
        ep_id = f"comedy_2020_ep{ep_num}"
        title = f"קומדי סטור 2020 — פרק {ep_num}"
        subtitle_file = f"subtitles/{ep_id}.json"

        lines = parse_srt(srt_path)
        SUBTITLES_DIR.mkdir(parents=True, exist_ok=True)
        (SUBTITLES_DIR / f"{ep_id}.json").write_text(
            json.dumps(lines, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

        # Sort 2020 eps after all regular episodes (num 10001+)
        episodes.append(
            {
                "id": ep_id,
                "title": title,
                "num": 10000 + ep_num,
                "subtitle_file": subtitle_file,
            }
        )
        print(f"  {ep_id}: {len(lines)} lines")

    return episodes


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Processing regular episodes...")
    regular = process_regular_episodes()

    print("Processing Comedy Store 2020 episodes...")
    special = process_2020_episodes()

    all_episodes = sorted(regular + special, key=lambda e: e["num"])

    index_path = OUT_DIR / "episodes.json"
    index_path.write_text(
        json.dumps(all_episodes, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nDone. {len(all_episodes)} episodes → {index_path}")


if __name__ == "__main__":
    main()
