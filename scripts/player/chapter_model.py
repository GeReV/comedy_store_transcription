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

    def split(self, index: int, split_ns: int) -> None:
        ch = self._chapters[index]
        if not (ch.start_ns < split_ns < ch.end_ns):
            return
        before = self._snapshot()
        self._chapters[index] = Chapter(ch.start_ns, split_ns, ch.name)
        self._chapters.insert(index + 1, Chapter(split_ns, ch.end_ns, ch.name))
        after = self._snapshot()
        self._record(before, after)

    def merge_with_previous(self, index: int) -> None:
        if index == 0:
            return
        before = self._snapshot()
        self._chapters[index - 1].end_ns = self._chapters[index].end_ns
        self._chapters.pop(index)
        after = self._snapshot()
        self._record(before, after)

    def rename(self, index: int, new_name: str) -> None:
        before = self._snapshot()
        self._chapters[index].name = new_name
        after = self._snapshot()
        self._record(before, after)

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
