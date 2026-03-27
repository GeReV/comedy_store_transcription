from __future__ import annotations

import sys
from pathlib import Path

from PyQt6.QtWidgets import QApplication

from .player_window import PlayerWindow
from .chapter_io import output_path_for


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Video player with chapter editor")
    parser.add_argument("media", nargs="?", help="Path to media file (.mkv, .mp4, ...)")
    parser.add_argument("chapters", nargs="?", help="Path to .chapters.xml file")
    args = parser.parse_args()

    app = QApplication(sys.argv)
    window = PlayerWindow()
    window.resize(1280, 720)
    window.show()

    if args.media:
        window.load_media(Path(args.media))

    if args.chapters:
        chapters_path = Path(args.chapters)
        out_path = output_path_for(chapters_path)
        load_path = out_path if out_path.exists() else chapters_path
        window.load_chapters(load_path, out_path)

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
