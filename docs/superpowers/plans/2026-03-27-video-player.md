# Video Player with Chapter Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PyQt6 desktop video player that displays chapter markers on a scrubbable timeline and supports keyboard-driven chapter editing (merge, split, rename, boundary nudge) with undo/redo, saving to a separate `.chapters.edited.xml` file.

**Architecture:** Five modules in `scripts/player/`: pure-Python `chapter_model.py` (data + undo stack) and `chapter_io.py` (XML read/write) are fully unit-tested; `timeline_widget.py` (custom `QWidget`) and `player_window.py` (`QMainWindow`) are implemented without automated UI tests. `__main__.py` wires everything together.

**Tech Stack:** Python 3.13, PyQt6 (QtWidgets, QtMultimedia, QtMultimediaWidgets), pytest

---

### Task 1: Project setup

**Files:**
- Modify: `pyproject.toml`
- Create: `scripts/__init__.py`
- Create: `scripts/player/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/player/__init__.py`

- [ ] **Step 1: Add PyQt6 and pytest to pyproject.toml**

Replace the entire contents of `pyproject.toml` with:

```toml
[project]
name = "comedy-store-transcribe"
version = "0.1.0"
requires-python = ">=3.13"
dependencies = ["PyQt6"]

[dependency-groups]
dev = ["pytest"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 2: Create package init files**

Create `scripts/__init__.py` — empty file.
Create `scripts/player/__init__.py` — empty file.
Create `tests/__init__.py` — empty file.
Create `tests/player/__init__.py` — empty file.

- [ ] **Step 3: Install dependencies**

```bash
uv sync --dev
```

Expected: resolves PyQt6 and pytest, creates/updates `uv.lock`.

- [ ] **Step 4: Verify PyQt6 imports**

```bash
uv run python -c "from PyQt6.QtWidgets import QApplication; from PyQt6.QtMultimedia import QMediaPlayer; print('OK')"
```

Expected output: `OK`

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml uv.lock scripts/__init__.py scripts/player/__init__.py tests/__init__.py tests/player/__init__.py
git commit -m "feat(player): project setup — add PyQt6, pytest, package structure"
```

---

### Task 2: Chapter dataclass and UndoStack

**Files:**
- Create: `scripts/player/chapter_model.py`
- Create: `tests/player/test_chapter_model.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/player/test_chapter_model.py`:

```python
from scripts.player.chapter_model import Chapter, UndoStack


def test_chapter_fields():
    ch = Chapter(start_ns=1_000_000_000, end_ns=5_000_000_000, name="Intro")
    assert ch.start_ns == 1_000_000_000
    assert ch.end_ns == 5_000_000_000
    assert ch.name == "Intro"


def test_undo_stack_empty():
    stack = UndoStack()
    assert not stack.can_undo
    assert not stack.can_redo
    assert stack.undo() is False
    assert stack.redo() is False


def test_undo_stack_push_and_undo():
    log: list[str] = []
    stack = UndoStack()
    stack.push(undo_fn=lambda: log.append("undo"), redo_fn=lambda: log.append("redo"))
    assert stack.can_undo
    assert not stack.can_redo
    result = stack.undo()
    assert result is True
    assert log == ["undo"]
    assert not stack.can_undo
    assert stack.can_redo


def test_undo_stack_redo():
    log: list[str] = []
    stack = UndoStack()
    stack.push(undo_fn=lambda: log.append("undo"), redo_fn=lambda: log.append("redo"))
    stack.undo()
    result = stack.redo()
    assert result is True
    assert log == ["undo", "redo"]
    assert stack.can_undo
    assert not stack.can_redo


def test_undo_stack_push_truncates_redo_history():
    log: list[str] = []
    stack = UndoStack()
    stack.push(undo_fn=lambda: log.append("u1"), redo_fn=lambda: log.append("r1"))
    stack.push(undo_fn=lambda: log.append("u2"), redo_fn=lambda: log.append("r2"))
    stack.undo()  # cursor at 1
    # Push a new entry — should discard the undone entry
    stack.push(undo_fn=lambda: log.append("u3"), redo_fn=lambda: log.append("r3"))
    assert not stack.can_redo
    stack.undo()
    assert log[-1] == "u3"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_model.py -v
```

Expected: `ERROR` — `cannot import name 'Chapter'`

- [ ] **Step 3: Implement Chapter and UndoStack**

Create `scripts/player/chapter_model.py`:

```python
from __future__ import annotations
from dataclasses import dataclass
from typing import Callable


@dataclass
class Chapter:
    start_ns: int
    end_ns: int
    name: str


class UndoStack:
    def __init__(self) -> None:
        self._entries: list[tuple[Callable[[], None], Callable[[], None]]] = []
        self._cursor: int = 0

    def push(self, undo_fn: Callable[[], None], redo_fn: Callable[[], None]) -> None:
        del self._entries[self._cursor:]
        self._entries.append((undo_fn, redo_fn))
        self._cursor = len(self._entries)

    def undo(self) -> bool:
        if self._cursor == 0:
            return False
        self._cursor -= 1
        self._entries[self._cursor][0]()
        return True

    def redo(self) -> bool:
        if self._cursor >= len(self._entries):
            return False
        self._entries[self._cursor][1]()
        self._cursor += 1
        return True

    @property
    def can_undo(self) -> bool:
        return self._cursor > 0

    @property
    def can_redo(self) -> bool:
        return self._cursor < len(self._entries)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/player/test_chapter_model.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_model.py tests/player/test_chapter_model.py
git commit -m "feat(player): Chapter dataclass and UndoStack"
```

---

### Task 3: ChapterList core — init, `chapters` property, `current_index`

**Files:**
- Modify: `scripts/player/chapter_model.py`
- Modify: `tests/player/test_chapter_model.py`

- [ ] **Step 1: Add failing tests** (append to `tests/player/test_chapter_model.py`)

```python
from scripts.player.chapter_model import Chapter, UndoStack, ChapterList


def _make_list() -> ChapterList:
    return ChapterList([
        Chapter(0, 5_000_000_000, "A"),
        Chapter(5_000_000_000, 10_000_000_000, "B"),
        Chapter(10_000_000_000, 20_000_000_000, "C"),
    ])


def test_chapterlist_len_and_getitem():
    cl = _make_list()
    assert len(cl) == 3
    assert cl[0].name == "A"
    assert cl[2].name == "C"


def test_chapterlist_chapters_returns_copy():
    cl = _make_list()
    chapters = cl.chapters
    chapters[0].name = "MUTATED"
    assert cl[0].name == "A"  # original unchanged


def test_current_index_within_chapter():
    cl = _make_list()
    assert cl.current_index(0) == 0
    assert cl.current_index(4_999_999_999) == 0
    assert cl.current_index(5_000_000_000) == 1
    assert cl.current_index(15_000_000_000) == 2


def test_current_index_beyond_end():
    cl = _make_list()
    assert cl.current_index(99_000_000_000) == 2


def test_current_index_empty():
    cl = ChapterList([])
    assert cl.current_index(0) == -1
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_model.py::test_chapterlist_len_and_getitem -v
```

Expected: `ERROR` — `cannot import name 'ChapterList'`

- [ ] **Step 3: Implement ChapterList core** (append to `scripts/player/chapter_model.py`)

```python
class ChapterList:
    def __init__(self, chapters: list[Chapter]) -> None:
        self._chapters: list[Chapter] = list(chapters)
        self._undo_stack: UndoStack = UndoStack()
        self.frame_ns: int = 33_333_333  # updated from video metadata after load

    def __len__(self) -> int:
        return len(self._chapters)

    def __getitem__(self, index: int) -> Chapter:
        return self._chapters[index]

    @property
    def chapters(self) -> list[Chapter]:
        return [Chapter(c.start_ns, c.end_ns, c.name) for c in self._chapters]

    def current_index(self, position_ns: int) -> int:
        for i, ch in enumerate(self._chapters):
            if ch.start_ns <= position_ns < ch.end_ns:
                return i
        if self._chapters and position_ns >= self._chapters[-1].start_ns:
            return len(self._chapters) - 1
        return -1

    # --- undo/redo passthrough ---

    def undo(self) -> bool:
        return self._undo_stack.undo()

    def redo(self) -> bool:
        return self._undo_stack.redo()

    @property
    def can_undo(self) -> bool:
        return self._undo_stack.can_undo

    @property
    def can_redo(self) -> bool:
        return self._undo_stack.can_redo

    # --- private helpers ---

    def _snapshot(self) -> list[Chapter]:
        return [Chapter(c.start_ns, c.end_ns, c.name) for c in self._chapters]

    def _restore(self, snapshot: list[Chapter]) -> None:
        self._chapters.clear()
        self._chapters.extend(snapshot)

    def _record(self, before: list[Chapter], after: list[Chapter]) -> None:
        self._undo_stack.push(
            lambda: self._restore(before),
            lambda: self._restore(after),
        )
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/player/test_chapter_model.py -v
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_model.py tests/player/test_chapter_model.py
git commit -m "feat(player): ChapterList core — chapters property, current_index"
```

---

### Task 4: ChapterList.rename

**Files:**
- Modify: `scripts/player/chapter_model.py`
- Modify: `tests/player/test_chapter_model.py`

- [ ] **Step 1: Add failing test** (append to `tests/player/test_chapter_model.py`)

```python
def test_rename():
    cl = _make_list()
    cl.rename(1, "New Name")
    assert cl[1].name == "New Name"
    assert cl[0].name == "A"  # others unchanged


def test_rename_undo_redo():
    cl = _make_list()
    cl.rename(0, "X")
    assert cl[0].name == "X"
    cl.undo()
    assert cl[0].name == "A"
    cl.redo()
    assert cl[0].name == "X"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_model.py::test_rename -v
```

Expected: `FAILED` — `AttributeError: 'ChapterList' object has no attribute 'rename'`

- [ ] **Step 3: Implement rename** (append inside `ChapterList` in `chapter_model.py`)

```python
    def rename(self, index: int, new_name: str) -> None:
        before = self._snapshot()
        self._chapters[index].name = new_name
        after = self._snapshot()
        self._record(before, after)
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/player/test_chapter_model.py -v
```

Expected: all 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_model.py tests/player/test_chapter_model.py
git commit -m "feat(player): ChapterList.rename with undo/redo"
```

---

### Task 5: ChapterList.merge_with_previous

**Files:**
- Modify: `scripts/player/chapter_model.py`
- Modify: `tests/player/test_chapter_model.py`

- [ ] **Step 1: Add failing tests** (append to `tests/player/test_chapter_model.py`)

```python
def test_merge_with_previous():
    cl = _make_list()
    cl.merge_with_previous(1)
    assert len(cl) == 2
    assert cl[0].start_ns == 0
    assert cl[0].end_ns == 10_000_000_000  # extends to cover former chapter 1
    assert cl[0].name == "A"               # keeps preceding chapter name
    assert cl[1].name == "C"


def test_merge_noop_on_first_chapter():
    cl = _make_list()
    cl.merge_with_previous(0)
    assert len(cl) == 3  # unchanged


def test_merge_undo():
    cl = _make_list()
    cl.merge_with_previous(1)
    cl.undo()
    assert len(cl) == 3
    assert cl[0].end_ns == 5_000_000_000
    assert cl[1].name == "B"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_model.py::test_merge_with_previous -v
```

Expected: `FAILED` — `AttributeError: 'ChapterList' object has no attribute 'merge_with_previous'`

- [ ] **Step 3: Implement merge_with_previous** (append inside `ChapterList`)

```python
    def merge_with_previous(self, index: int) -> None:
        if index == 0:
            return
        before = self._snapshot()
        self._chapters[index - 1].end_ns = self._chapters[index].end_ns
        self._chapters.pop(index)
        after = self._snapshot()
        self._record(before, after)
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/player/test_chapter_model.py -v
```

Expected: all 16 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_model.py tests/player/test_chapter_model.py
git commit -m "feat(player): ChapterList.merge_with_previous with undo/redo"
```

---

### Task 6: ChapterList.split

**Files:**
- Modify: `scripts/player/chapter_model.py`
- Modify: `tests/player/test_chapter_model.py`

- [ ] **Step 1: Add failing tests** (append to `tests/player/test_chapter_model.py`)

```python
def test_split():
    cl = _make_list()
    cl.split(0, 2_000_000_000)
    assert len(cl) == 4
    assert cl[0].start_ns == 0
    assert cl[0].end_ns == 2_000_000_000
    assert cl[0].name == "A"
    assert cl[1].start_ns == 2_000_000_000
    assert cl[1].end_ns == 5_000_000_000
    assert cl[1].name == "A"


def test_split_noop_at_boundary():
    cl = _make_list()
    cl.split(0, 0)               # at start — not strictly inside
    assert len(cl) == 3
    cl.split(0, 5_000_000_000)   # at end — not strictly inside
    assert len(cl) == 3


def test_split_undo():
    cl = _make_list()
    cl.split(1, 7_000_000_000)
    assert len(cl) == 4
    cl.undo()
    assert len(cl) == 3
    assert cl[1].name == "B"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_model.py::test_split -v
```

Expected: `FAILED` — `AttributeError: 'ChapterList' object has no attribute 'split'`

- [ ] **Step 3: Implement split** (append inside `ChapterList`)

```python
    def split(self, index: int, split_ns: int) -> None:
        ch = self._chapters[index]
        if not (ch.start_ns < split_ns < ch.end_ns):
            return
        before = self._snapshot()
        self._chapters[index] = Chapter(ch.start_ns, split_ns, ch.name)
        self._chapters.insert(index + 1, Chapter(split_ns, ch.end_ns, ch.name))
        after = self._snapshot()
        self._record(before, after)
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/player/test_chapter_model.py -v
```

Expected: all 19 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_model.py tests/player/test_chapter_model.py
git commit -m "feat(player): ChapterList.split with undo/redo"
```

---

### Task 7: ChapterList.move_boundary

**Files:**
- Modify: `scripts/player/chapter_model.py`
- Modify: `tests/player/test_chapter_model.py`

- [ ] **Step 1: Add failing tests** (append to `tests/player/test_chapter_model.py`)

```python
def test_move_boundary():
    cl = _make_list()
    cl.frame_ns = 1_000_000  # 1ms frame for test clarity
    cl.move_boundary(1, 1_000_000_000)   # shift ch[1] start +1s
    assert cl[0].end_ns == 6_000_000_000
    assert cl[1].start_ns == 6_000_000_000


def test_move_boundary_clamped_min():
    cl = _make_list()
    cl.frame_ns = 1_000_000_000  # 1s frame
    # Shift ch[1] start so far left it would make ch[0] < 1 frame
    cl.move_boundary(1, -10_000_000_000)
    # ch[0] must be at least frame_ns (1s) wide: start=0, so min end=1_000_000_000
    assert cl[1].start_ns == 1_000_000_000
    assert cl[0].end_ns == 1_000_000_000


def test_move_boundary_clamped_max():
    cl = _make_list()
    cl.frame_ns = 1_000_000_000  # 1s frame
    # Shift ch[1] start so far right it would make ch[1] < 1 frame
    cl.move_boundary(1, 10_000_000_000)
    # ch[1] end=10s, so max start = 10s - 1s = 9s
    assert cl[1].start_ns == 9_000_000_000
    assert cl[0].end_ns == 9_000_000_000


def test_move_boundary_noop_index_zero():
    cl = _make_list()
    cl.move_boundary(0, 1_000_000_000)
    assert cl[0].start_ns == 0  # unchanged


def test_move_boundary_undo():
    cl = _make_list()
    cl.frame_ns = 1_000_000
    cl.move_boundary(1, 1_000_000_000)
    cl.undo()
    assert cl[0].end_ns == 5_000_000_000
    assert cl[1].start_ns == 5_000_000_000
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_model.py::test_move_boundary -v
```

Expected: `FAILED` — `AttributeError: 'ChapterList' object has no attribute 'move_boundary'`

- [ ] **Step 3: Implement move_boundary** (append inside `ChapterList`)

```python
    def move_boundary(self, index: int, delta_ns: int) -> None:
        if index == 0:
            return
        before = self._snapshot()
        new_start = self._chapters[index].start_ns + delta_ns
        min_start = self._chapters[index - 1].start_ns + self.frame_ns
        max_start = self._chapters[index].end_ns - self.frame_ns
        new_start = max(min_start, min(max_start, new_start))
        self._chapters[index - 1].end_ns = new_start
        self._chapters[index].start_ns = new_start
        after = self._snapshot()
        self._record(before, after)
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/player/test_chapter_model.py -v
```

Expected: all 24 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_model.py tests/player/test_chapter_model.py
git commit -m "feat(player): ChapterList.move_boundary with clamping and undo/redo"
```

---

### Task 8: MatroskaIO.read

**Files:**
- Create: `scripts/player/chapter_io.py`
- Create: `tests/player/test_chapter_io.py`

- [ ] **Step 1: Write failing tests**

Create `tests/player/test_chapter_io.py`:

```python
import textwrap
from pathlib import Path
import pytest
from scripts.player.chapter_io import MatroskaIO
from scripts.player.chapter_model import Chapter

SAMPLE_XML = textwrap.dedent("""\
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE Chapters SYSTEM "matroskachapters.dtd">
    <Chapters>
      <EditionEntry>
        <ChapterAtom>
          <ChapterTimeStart>1000000000</ChapterTimeStart>
          <ChapterTimeEnd>5000000000</ChapterTimeEnd>
          <ChapterDisplay>
            <ChapterString>Intro</ChapterString>
            <ChapterLanguage>heb</ChapterLanguage>
          </ChapterDisplay>
        </ChapterAtom>
        <ChapterAtom>
          <ChapterTimeStart>5000000000</ChapterTimeStart>
          <ChapterTimeEnd>10000000000</ChapterTimeEnd>
          <ChapterDisplay>
            <ChapterString>Main</ChapterString>
            <ChapterLanguage>heb</ChapterLanguage>
          </ChapterDisplay>
        </ChapterAtom>
      </EditionEntry>
    </Chapters>
""")


@pytest.fixture
def xml_file(tmp_path: Path) -> Path:
    p = tmp_path / "ep.chapters.xml"
    p.write_text(SAMPLE_XML, encoding="utf-8")
    return p


def test_read_chapter_count(xml_file: Path):
    chapters = MatroskaIO().read(xml_file)
    assert len(chapters) == 2


def test_read_chapter_timestamps(xml_file: Path):
    chapters = MatroskaIO().read(xml_file)
    assert chapters[0].start_ns == 1_000_000_000
    assert chapters[0].end_ns == 5_000_000_000
    assert chapters[1].start_ns == 5_000_000_000
    assert chapters[1].end_ns == 10_000_000_000


def test_read_chapter_names(xml_file: Path):
    chapters = MatroskaIO().read(xml_file)
    assert chapters[0].name == "Intro"
    assert chapters[1].name == "Main"


def test_read_returns_chapter_instances(xml_file: Path):
    chapters = MatroskaIO().read(xml_file)
    assert all(isinstance(c, Chapter) for c in chapters)
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_io.py -v
```

Expected: `ERROR` — `cannot import name 'MatroskaIO'`

- [ ] **Step 3: Implement MatroskaIO.read**

Create `scripts/player/chapter_io.py`:

```python
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
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/player/test_chapter_io.py -v
```

Expected: the 4 read tests PASS; `write` tests not yet written so nothing else runs.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_io.py tests/player/test_chapter_io.py
git commit -m "feat(player): MatroskaIO.read"
```

---

### Task 9: MatroskaIO.write and round-trip

**Files:**
- Modify: `scripts/player/chapter_io.py`
- Modify: `tests/player/test_chapter_io.py`

- [ ] **Step 1: Add failing tests** (append to `tests/player/test_chapter_io.py`)

```python
def test_write_produces_readable_xml(tmp_path: Path):
    chapters = [
        Chapter(start_ns=0, end_ns=3_000_000_000, name="First"),
        Chapter(start_ns=3_000_000_000, end_ns=8_000_000_000, name="Second"),
    ]
    out = tmp_path / "out.chapters.xml"
    MatroskaIO().write(chapters, out)
    assert out.exists()
    # Must be parseable XML
    import xml.etree.ElementTree as ET
    ET.parse(out)


def test_roundtrip(xml_file: Path, tmp_path: Path):
    io = MatroskaIO()
    original = io.read(xml_file)
    out = tmp_path / "out.chapters.xml"
    io.write(original, out)
    recovered = io.read(out)
    assert len(recovered) == len(original)
    for orig, rec in zip(original, recovered):
        assert rec.start_ns == orig.start_ns
        assert rec.end_ns == orig.end_ns
        assert rec.name == orig.name


def test_write_preserves_edited_names(tmp_path: Path):
    chapters = [Chapter(start_ns=0, end_ns=5_000_000_000, name="My Custom Name")]
    out = tmp_path / "out.chapters.xml"
    MatroskaIO().write(chapters, out)
    recovered = MatroskaIO().read(out)
    assert recovered[0].name == "My Custom Name"
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/player/test_chapter_io.py::test_write_produces_readable_xml -v
```

Expected: `FAILED` — `NotImplementedError`

- [ ] **Step 3: Implement MatroskaIO.write** (replace the `write` stub in `chapter_io.py`)

```python
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
```

- [ ] **Step 4: Run all tests**

```bash
uv run pytest tests/player/ -v
```

Expected: all 31 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/player/chapter_io.py tests/player/test_chapter_io.py
git commit -m "feat(player): MatroskaIO.write and round-trip"
```

---

### Task 10: TimelineWidget

**Files:**
- Create: `scripts/player/timeline_widget.py`

No automated unit tests for painting logic. The widget is verified visually when the player runs.

- [ ] **Step 1: Create timeline_widget.py**

```python
from __future__ import annotations

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QBrush, QColor, QPainter, QPen, QPolygon
from PyQt6.QtCore import QPoint
from PyQt6.QtWidgets import QWidget

from .chapter_model import ChapterList

_CHAPTER_COLORS = [QColor(58, 90, 138), QColor(45, 110, 78)]
_CURRENT_COLORS = [QColor(90, 138, 191), QColor(70, 160, 115)]
_PLAYHEAD_COLOR = QColor(255, 68, 68)
_TEXT_COLOR = QColor(255, 255, 255, 200)


class TimelineWidget(QWidget):
    seek_requested = pyqtSignal(int)  # nanoseconds

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._chapters: ChapterList | None = None
        self._position_ns: int = 0
        self.setMinimumHeight(50)
        self.setMaximumHeight(50)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def set_chapters(self, chapters: ChapterList) -> None:
        self._chapters = chapters
        self.update()

    def set_position(self, position_ns: int) -> None:
        self._position_ns = position_ns
        self.update()

    def paintEvent(self, event) -> None:  # type: ignore[override]
        if self._chapters is None or len(self._chapters) == 0:
            return

        painter = QPainter(self)
        w = self.width()
        h = self.height()

        first_ns = self._chapters[0].start_ns
        last_ns = self._chapters[len(self._chapters) - 1].end_ns
        total_ns = last_ns - first_ns
        if total_ns == 0:
            return

        def to_x(ns: int) -> int:
            return int((ns - first_ns) / total_ns * w)

        current_idx = self._chapters.current_index(self._position_ns)

        for i, ch in enumerate(self._chapters.chapters):
            x1 = to_x(ch.start_ns)
            x2 = to_x(ch.end_ns)
            color = _CURRENT_COLORS[i % 2] if i == current_idx else _CHAPTER_COLORS[i % 2]
            painter.fillRect(x1, 0, x2 - x1 - 1, h, color)

            if x2 - x1 > 20:
                painter.setPen(_TEXT_COLOR)
                painter.drawText(
                    x1 + 3, 0, x2 - x1 - 6, h,
                    Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft,
                    ch.name,
                )

        # Playhead
        px = to_x(self._position_ns)
        painter.setPen(QPen(_PLAYHEAD_COLOR, 2))
        painter.drawLine(px, 0, px, h)
        triangle = QPolygon([QPoint(px - 4, 0), QPoint(px + 4, 0), QPoint(px, 7)])
        painter.setBrush(QBrush(_PLAYHEAD_COLOR))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawPolygon(triangle)

    def mousePressEvent(self, event) -> None:  # type: ignore[override]
        if self._chapters is None or len(self._chapters) == 0:
            return
        first_ns = self._chapters[0].start_ns
        last_ns = self._chapters[len(self._chapters) - 1].end_ns
        total_ns = last_ns - first_ns
        if total_ns == 0:
            return
        frac = event.position().x() / self.width()
        seek_ns = first_ns + int(frac * total_ns)
        self.seek_requested.emit(seek_ns)
```

- [ ] **Step 2: Verify import works**

```bash
uv run python -c "from scripts.player.timeline_widget import TimelineWidget; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Run all tests to confirm nothing broken**

```bash
uv run pytest tests/player/ -v
```

Expected: all 31 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/player/timeline_widget.py
git commit -m "feat(player): TimelineWidget — chapter segments, playhead, click-to-seek"
```

---

### Task 11: PlayerWindow

**Files:**
- Create: `scripts/player/player_window.py`

- [ ] **Step 1: Create player_window.py**

```python
from __future__ import annotations

import logging
from pathlib import Path

from PyQt6.QtCore import QTimer, QUrl, Qt
from PyQt6.QtMultimedia import QAudioOutput, QMediaMetaData, QMediaPlayer
from PyQt6.QtMultimediaWidgets import QVideoWidget
from PyQt6.QtWidgets import QInputDialog, QMainWindow, QVBoxLayout, QWidget

from .chapter_io import get_io, MatroskaIO
from .chapter_model import ChapterList
from .timeline_widget import TimelineWidget


class PlayerWindow(QMainWindow):
    def __init__(self, media_path: Path, chapters_path: Path, output_path: Path) -> None:
        super().__init__()
        self.setWindowTitle(media_path.name)

        self._output_path = output_path
        self._frame_ns: int = 0  # set after media loads

        self._chapters = ChapterList(get_io(chapters_path).read(chapters_path))

        self._video_widget = QVideoWidget()
        self._timeline = TimelineWidget()
        self._timeline.set_chapters(self._chapters)
        self._timeline.seek_requested.connect(self._on_seek_requested)

        self._audio_output = QAudioOutput()
        self._player = QMediaPlayer()
        self._player.setAudioOutput(self._audio_output)
        self._player.setVideoOutput(self._video_widget)
        self._player.setSource(QUrl.fromLocalFile(str(media_path.resolve())))
        self._player.mediaStatusChanged.connect(self._on_media_status_changed)

        central = QWidget()
        layout = QVBoxLayout(central)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(self._video_widget)
        layout.addWidget(self._timeline)
        self.setCentralWidget(central)

        self._timer = QTimer()
        self._timer.setInterval(16)
        self._timer.timeout.connect(self._on_timer)
        self._timer.start()

        self._player.play()

    # --- slots ---

    def _on_media_status_changed(self, status: QMediaPlayer.MediaStatus) -> None:
        if status == QMediaPlayer.MediaStatus.LoadedMedia:
            fps = self._player.metaData().value(QMediaMetaData.Key.VideoFrameRate)
            if fps and float(fps) > 0:
                self._frame_ns = round(1_000_000_000 / float(fps))
                self._chapters.frame_ns = self._frame_ns
            else:
                logging.warning("No VideoFrameRate metadata — frame-step disabled")
                self._frame_ns = 0

    def _on_timer(self) -> None:
        pos_ns = self._player.position() * 1_000_000
        self._timeline.set_position(pos_ns)
        self._update_status()

    def _on_seek_requested(self, position_ns: int) -> None:
        self._player.setPosition(position_ns // 1_000_000)

    # --- keyboard ---

    def keyPressEvent(self, event) -> None:  # type: ignore[override]
        key = event.key()
        mods = event.modifiers()
        Mod = Qt.KeyboardModifier
        Key = Qt.Key

        # Play / pause
        if key == Key.Key_Space:
            if self._player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
                self._player.pause()
            else:
                self._player.play()

        # Seek (plain arrows)
        elif key == Key.Key_Left and mods == Mod.NoModifier:
            self._seek_ms(-5_000)
        elif key == Key.Key_Right and mods == Mod.NoModifier:
            self._seek_ms(5_000)
        elif key == Key.Key_Left and mods == Mod.ControlModifier:
            self._seek_ms(-60_000)
        elif key == Key.Key_Right and mods == Mod.ControlModifier:
            self._seek_ms(60_000)
        elif key == Key.Key_Left and mods == Mod.AltModifier:
            self._seek_ms(-15_000)
        elif key == Key.Key_Right and mods == Mod.AltModifier:
            self._seek_ms(15_000)

        # Chapter navigation
        elif key == Key.Key_BracketLeft:
            self._jump_chapter(-1)
        elif key == Key.Key_BracketRight:
            self._jump_chapter(1)

        # Frame step
        elif key == Key.Key_Comma and mods == Mod.NoModifier:
            self._step_frame(-1)
        elif key == Key.Key_Period and mods == Mod.NoModifier:
            self._step_frame(1)

        # Boundary nudge — 1 frame
        elif key == Key.Key_Comma and mods == Mod.ShiftModifier:
            self._nudge_boundary(-self._frame_ns)
        elif key == Key.Key_Period and mods == Mod.ShiftModifier:
            self._nudge_boundary(self._frame_ns)

        # Boundary nudge — 1s
        elif key == Key.Key_Left and mods == Mod.ShiftModifier:
            self._nudge_boundary(-1_000_000_000)
        elif key == Key.Key_Right and mods == Mod.ShiftModifier:
            self._nudge_boundary(1_000_000_000)

        # Boundary nudge — 5s
        elif key == Key.Key_Left and mods == (Mod.ShiftModifier | Mod.ControlModifier):
            self._nudge_boundary(-5_000_000_000)
        elif key == Key.Key_Right and mods == (Mod.ShiftModifier | Mod.ControlModifier):
            self._nudge_boundary(5_000_000_000)

        # Chapter operations
        elif key == Key.Key_Delete:
            self._merge_chapter()
        elif key == Key.Key_S and mods == Mod.ControlModifier:
            self._save()
        elif key == Key.Key_S and mods == Mod.NoModifier:
            self._split_chapter()
        elif key == Key.Key_R:
            self._rename_chapter()

        # Undo / redo
        elif key == Key.Key_Z and mods == Mod.ControlModifier:
            if self._chapters.undo():
                self._timeline.set_chapters(self._chapters)
                self._update_status()
        elif key == Key.Key_Z and mods == (Mod.ControlModifier | Mod.ShiftModifier):
            if self._chapters.redo():
                self._timeline.set_chapters(self._chapters)
                self._update_status()

    # --- private helpers ---

    def _pos_ns(self) -> int:
        return self._player.position() * 1_000_000

    def _seek_ms(self, delta_ms: int) -> None:
        self._player.setPosition(max(0, self._player.position() + delta_ms))

    def _jump_chapter(self, direction: int) -> None:
        idx = self._chapters.current_index(self._pos_ns()) + direction
        if 0 <= idx < len(self._chapters):
            self._player.setPosition(self._chapters[idx].start_ns // 1_000_000)

    def _step_frame(self, direction: int) -> None:
        if self._frame_ns == 0:
            return
        self._seek_ms(direction * self._frame_ns // 1_000_000)

    def _nudge_boundary(self, delta_ns: int) -> None:
        if delta_ns == 0:
            return  # frame_ns not yet known; Shift+,/. is a no-op until media loads
        idx = self._chapters.current_index(self._pos_ns())
        if idx <= 0:
            return
        self._chapters.move_boundary(idx, delta_ns)
        self._timeline.set_chapters(self._chapters)
        self._update_status()

    def _merge_chapter(self) -> None:
        idx = self._chapters.current_index(self._pos_ns())
        if idx <= 0:
            return
        self._chapters.merge_with_previous(idx)
        self._timeline.set_chapters(self._chapters)
        self._update_status()

    def _split_chapter(self) -> None:
        pos = self._pos_ns()
        idx = self._chapters.current_index(pos)
        if idx < 0:
            return
        self._chapters.split(idx, pos)
        self._timeline.set_chapters(self._chapters)
        self._update_status()

    def _rename_chapter(self) -> None:
        idx = self._chapters.current_index(self._pos_ns())
        if idx < 0:
            return
        current_name = self._chapters[idx].name
        new_name, ok = QInputDialog.getText(
            self, "Rename Chapter", "Chapter name:", text=current_name
        )
        if ok and new_name != current_name:
            self._chapters.rename(idx, new_name)
            self._timeline.set_chapters(self._chapters)
            self._update_status()

    def _save(self) -> None:
        MatroskaIO().write(self._chapters.chapters, self._output_path)
        self.statusBar().showMessage(f"Saved → {self._output_path.name}", 3000)

    def _update_status(self) -> None:
        pos_ns = self._pos_ns()
        idx = self._chapters.current_index(pos_ns)
        if idx < 0:
            return
        ch = self._chapters[idx]
        total_s = pos_ns // 1_000_000_000
        h, m, s = total_s // 3600, (total_s % 3600) // 60, total_s % 60
        undo_hint = " [unsaved]" if self._chapters.can_undo else ""
        self.statusBar().showMessage(
            f"Chapter {idx + 1}/{len(self._chapters)}: {ch.name}  |  "
            f"{h:02d}:{m:02d}:{s:02d}{undo_hint}"
        )
```

- [ ] **Step 2: Verify import works**

```bash
uv run python -c "from scripts.player.player_window import PlayerWindow; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Run all tests**

```bash
uv run pytest tests/player/ -v
```

Expected: all 31 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/player/player_window.py
git commit -m "feat(player): PlayerWindow — video playback, keyboard bindings, chapter editing"
```

---

### Task 12: Entry point and manual smoke test

**Files:**
- Create: `scripts/player/__main__.py`

- [ ] **Step 1: Create __main__.py**

```python
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
```

- [ ] **Step 2: Run final test suite**

```bash
uv run pytest tests/player/ -v
```

Expected: all 31 tests PASS.

- [ ] **Step 3: Smoke test with a real file**

```bash
uv run python -m scripts.player "H:\Comedy_Store\Season1\פרק_001.mkv" "files/פרק_001-21_12_08/פרק_001-21.12.08.chapters.xml"
```

Expected: player window opens, video plays, chapters visible on timeline.

Verify manually:
- `[` / `]` jumps between chapters
- `Space` pauses/resumes
- `←` seeks back 5s
- `Delete` merges current chapter with previous; timeline redraws
- `S` splits chapter at playhead; timeline redraws
- `Ctrl+Z` undoes the split
- `R` opens rename dialog
- `Ctrl+S` saves; status bar shows "Saved → ..."
- Re-run the command — player loads from `.chapters.edited.xml` automatically

- [ ] **Step 4: Commit**

```bash
git add scripts/player/__main__.py
git commit -m "feat(player): entry point — arg parsing, output path, auto-load edited file"
```
