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
