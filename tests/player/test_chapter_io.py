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


from scripts.player.chapter_io import output_path_for


def test_output_path_for_chapters_xml():
    p = Path("/some/episode.chapters.xml")
    assert output_path_for(p) == Path("/some/episode.chapters.edited.xml")


def test_output_path_for_other_extension():
    p = Path("/some/episode.xml")
    assert output_path_for(p) == Path("/some/episode.edited.xml")
