import sys
import pytest
from PyQt6.QtWidgets import QApplication
from scripts.player.timeline_widget import TimelineWidget


@pytest.fixture(scope="module")
def qapp():
    return QApplication.instance() or QApplication(sys.argv)


def test_set_duration_stores_value(qapp):
    w = TimelineWidget()
    assert w._duration_ns == 0
    w.set_duration(5_000_000_000)
    assert w._duration_ns == 5_000_000_000


def test_set_duration_zero_resets(qapp):
    w = TimelineWidget()
    w.set_duration(5_000_000_000)
    w.set_duration(0)
    assert w._duration_ns == 0
