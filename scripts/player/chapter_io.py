from __future__ import annotations
from pathlib import Path
from typing import Protocol
import xml.etree.ElementTree as ET
from xml.dom.minidom import getDOMImplementation

from .chapter_model import Chapter


class ChapterReader(Protocol):
    def read(self, path: Path) -> list[Chapter]: ...


class ChapterWriter(Protocol):
    def write(self, chapters: list[Chapter], path: Path) -> None: ...


class MatroskaIO:
    def read(self, path: Path) -> list[Chapter]:
        tree = ET.parse(path)
        root = tree.getroot()
        chapters: list[Chapter] = []
        for atom in root.iter("ChapterAtom"):
            start_el = atom.find("ChapterTimeStart")
            end_el = atom.find("ChapterTimeEnd")
            name_el = atom.find("ChapterDisplay/ChapterString")
            if start_el is None or end_el is None:
                continue
            name = name_el.text if name_el is not None and name_el.text else "N/A"
            chapters.append(Chapter(
                start_ns=int(start_el.text),  # type: ignore[arg-type]
                end_ns=int(end_el.text),       # type: ignore[arg-type]
                name=name,
            ))
        return chapters

    def write(self, chapters: list[Chapter], path: Path) -> None:
        raise NotImplementedError


# Registry: maps lowercase file extension(s) to IO instance.
# Add a new entry here when supporting additional chapter formats.
_REGISTRY: dict[str, MatroskaIO] = {
    ".chapters.xml": MatroskaIO(),
}


def get_io(path: Path) -> MatroskaIO:
    key = "".join(path.suffixes[-2:]).lower()
    if key not in _REGISTRY:
        key = path.suffix.lower()
    if key not in _REGISTRY:
        raise ValueError(f"No chapter IO registered for {path.name!r}")
    return _REGISTRY[key]
