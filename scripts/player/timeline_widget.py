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
        self._duration_ns: int = 0
        self.setMinimumHeight(50)
        self.setMaximumHeight(50)
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def set_chapters(self, chapters: ChapterList) -> None:
        self._chapters = chapters
        self.update()

    def set_position(self, position_ns: int) -> None:
        self._position_ns = position_ns
        self.update()

    def set_duration(self, ns: int) -> None:
        self._duration_ns = ns
        self.update()

    def paintEvent(self, event) -> None:  # type: ignore[override]
        has_chapters = self._chapters is not None and len(self._chapters) > 0

        if has_chapters:
            first_ns = self._chapters[0].start_ns
            last_ns = self._chapters[len(self._chapters) - 1].end_ns
            total_ns = last_ns - first_ns
            if total_ns == 0:
                return
        elif self._duration_ns > 0:
            first_ns = 0
            total_ns = self._duration_ns
        else:
            return

        painter = QPainter(self)
        w = self.width()
        h = self.height()

        def to_x(ns: int) -> int:
            return int((ns - first_ns) / total_ns * w)

        if has_chapters:
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
        else:
            # Video-only state: plain scrub bar, no chapter segments
            painter.fillRect(0, 0, w, h, QColor(60, 60, 60))

        # Playhead
        px = to_x(self._position_ns)
        painter.setPen(QPen(_PLAYHEAD_COLOR, 2))
        painter.drawLine(px, 0, px, h)
        triangle = QPolygon([QPoint(px - 4, 0), QPoint(px + 4, 0), QPoint(px, 7)])
        painter.setBrush(QBrush(_PLAYHEAD_COLOR))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawPolygon(triangle)

    def mousePressEvent(self, event) -> None:  # type: ignore[override]
        has_chapters = self._chapters is not None and len(self._chapters) > 0
        if has_chapters:
            first_ns = self._chapters[0].start_ns
            last_ns = self._chapters[len(self._chapters) - 1].end_ns
            total_ns = last_ns - first_ns
        elif self._duration_ns > 0:
            first_ns = 0
            total_ns = self._duration_ns
        else:
            return
        if total_ns == 0:
            return
        frac = event.position().x() / self.width()
        seek_ns = first_ns + int(frac * total_ns)
        self.seek_requested.emit(seek_ns)
