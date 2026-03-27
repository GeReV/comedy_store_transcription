from scripts.player.chapter_model import Chapter, UndoStack, ChapterList


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
