from __future__ import annotations

import logging
from pathlib import Path

from PyQt6.QtCore import QTimer, QUrl, Qt
from PyQt6.QtMultimedia import QAudioOutput, QMediaMetaData, QMediaPlayer
from PyQt6.QtMultimediaWidgets import QVideoWidget
from PyQt6.QtWidgets import QInputDialog, QMainWindow, QVBoxLayout, QWidget

from .chapter_io import get_io, MatroskaIO, output_path_for
from .chapter_model import ChapterList
from .timeline_widget import TimelineWidget


class PlayerWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Chapter Player")

        self._output_path: Path | None = None
        self._frame_ns: int = 0

        self._chapters = ChapterList([])

        self._video_widget = QVideoWidget()
        self._timeline = TimelineWidget()
        self._timeline.set_chapters(self._chapters)
        self._timeline.seek_requested.connect(self._on_seek_requested)

        self._audio_output = QAudioOutput()
        self._player = QMediaPlayer()
        self._player.setAudioOutput(self._audio_output)
        self._player.setVideoOutput(self._video_widget)
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

        self.setAcceptDrops(True)
        self.statusBar().showMessage("Drop a video file to begin")

    # --- public API ---

    def load_media(self, path: Path) -> None:
        """Load a media file. Clears any previously loaded chapters."""
        self._frame_ns = 0
        self._chapters = ChapterList([])
        self._output_path = None
        self._timeline.set_chapters(self._chapters)
        self._timeline.set_duration(0)
        self.setWindowTitle(path.name)
        self._player.setSource(QUrl.fromLocalFile(str(path.resolve())))
        self._player.play()
        self.statusBar().showMessage("Drop .chapters.xml to add chapters")

    def load_chapters(self, path: Path, output_path: Path) -> None:
        """Load a chapters file. Media does not need to be loaded first."""
        self._output_path = output_path
        self._chapters = ChapterList(get_io(path).read(path))
        self._timeline.set_chapters(self._chapters)
        self._update_status()

    # --- drag and drop ---

    def dragEnterEvent(self, event) -> None:  # type: ignore[override]
        if event.mimeData().hasUrls():
            event.acceptProposedAction()

    def dropEvent(self, event) -> None:  # type: ignore[override]
        paths = [
            Path(url.toLocalFile())
            for url in event.mimeData().urls()
            if url.isLocalFile()
        ]
        # Process media files first, then chapters files
        media_paths = [p for p in paths if not p.name.lower().endswith(".chapters.xml")]
        chapter_paths = [p for p in paths if p.name.lower().endswith(".chapters.xml")]
        for p in media_paths:
            self.load_media(p)
        for p in chapter_paths:
            out = output_path_for(p)
            load_from = out if out.exists() else p
            self.load_chapters(load_from, out)

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
            self._timeline.set_duration(self._player.duration() * 1_000_000)

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
        if self._output_path is None:
            return
        try:
            MatroskaIO().write(self._chapters.chapters, self._output_path)
            self.statusBar().showMessage(f"Saved to {self._output_path.name}", 3000)
        except OSError as e:
            self.statusBar().showMessage(f"Save failed: {e}", 5000)

    def _update_status(self) -> None:
        if len(self._chapters) == 0:
            return  # preserve the drop-hint message in the status bar
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
