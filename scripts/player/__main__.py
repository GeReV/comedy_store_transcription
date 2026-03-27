from __future__ import annotations

import sys
from pathlib import Path

from PyQt6.QtWidgets import QApplication

from .player_window import PlayerWindow

_OUTPUT_SUFFIX = ".chapters.edited.xml"


def _output_path(chapters_path: Path) -> Path:
    name = chapters_path.name
    if name.endswith(".chapters.xml"):
        base = name[: -len(".chapters.xml")]
        return chapters_path.parent / (base + _OUTPUT_SUFFIX)
    return chapters_path.with_suffix(".edited.xml")


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Video player with chapter editor")
    parser.add_argument("media", help="Path to media file (.mkv, .mp4, ...)")
    parser.add_argument("chapters", help="Path to .chapters.xml file")
    args = parser.parse_args()

    media_path = Path(args.media)
    chapters_path = Path(args.chapters)
    out_path = _output_path(chapters_path)

    # On subsequent runs, load from the edited file if it exists
    load_path = out_path if out_path.exists() else chapters_path

    app = QApplication(sys.argv)
    window = PlayerWindow(media_path, load_path, out_path)
    window.resize(1280, 720)
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
