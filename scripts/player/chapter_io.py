from __future__ import annotations
from pathlib import Path
from typing import Protocol
import xml.etree.ElementTree as ET
from xml.dom.minidom import getDOMImplementation

from .chapter_model import Chapter


_OUTPUT_SUFFIX = ".edited.chapters.xml"


def output_path_for(chapters_path: Path) -> Path:
    """Derive the output (edited) path from a chapters file path."""
    name = chapters_path.name
    if name.endswith(".chapters.xml"):
        base = name[: -len(".chapters.xml")]
        return chapters_path.parent / (base + _OUTPUT_SUFFIX)
    return chapters_path.with_suffix(".edited.xml")


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
        impl = getDOMImplementation()
        doc = impl.createDocument(
            None, "Chapters",
            impl.createDocumentType("Chapters", None, "matroskachapters.dtd"),
        )
        root = doc.documentElement
        edition = doc.createElement("EditionEntry")
        root.appendChild(edition)

        for ch in chapters:
            atom = doc.createElement("ChapterAtom")

            start_el = doc.createElement("ChapterTimeStart")
            start_el.appendChild(doc.createTextNode(str(ch.start_ns)))
            atom.appendChild(start_el)

            end_el = doc.createElement("ChapterTimeEnd")
            end_el.appendChild(doc.createTextNode(str(ch.end_ns)))
            atom.appendChild(end_el)

            display = doc.createElement("ChapterDisplay")
            string_el = doc.createElement("ChapterString")
            string_el.appendChild(doc.createTextNode(ch.name))
            display.appendChild(string_el)
            lang_el = doc.createElement("ChapterLanguage")
            lang_el.appendChild(doc.createTextNode("heb"))
            display.appendChild(lang_el)
            atom.appendChild(display)

            edition.appendChild(atom)

        with open(path, "w", encoding="utf-8") as f:
            doc.writexml(f, addindent="  ", newl="\n", encoding="UTF-8")


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
