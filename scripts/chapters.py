"""
Converts a FFMPEG log containing scene info to a Matroska chapters file that can be used with MKVToolNix.

The FFMPEG log was generated with the following command:
    ffmpeg -i INPUT -filter:v "select='gt(scene,0.4)',showinfo" -f null - 2> OUTPUT.scenes

Episode XML example:

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Chapters SYSTEM "matroskachapters.dtd">
<Chapters>
  <EditionEntry>
    <ChapterAtom>
      <ChapterTimeStart>30000000000</ChapterTimeStart>
      <ChapterTimeEnd>80000000000</ChapterTimeEnd>
      <ChapterDisplay>
        <ChapterString>A short chapter</ChapterString>
        <ChapterLanguage>eng</ChapterLanguage>
      </ChapterDisplay>
    </ChapterAtom>
    <!-- More chapters... -->
  </EditionEntry>
</Chapters>
"""
import re
import os
import argparse
from xml.dom.minidom import Document, Element, getDOMImplementation

DURATION_RE = re.compile(r"  Duration: (\d+:\d+:\d+\.\d+),")
SCENE_RE = re.compile(r"^\[Parsed_showinfo_1 @ [0-9a-f]{16}] n:\s*[0-9]+ pts:\s*[0-9]+ pts_time:([0-9.]+) ")

def parse_duration(duration: str) -> int:
    hours, minutes, seconds, decimal = re.split(r'[:.]', duration)
    total_seconds = int(hours) * 3600 + int(minutes) * 60 + int(seconds)
    nanoseconds = total_seconds * (10 ** 9)

    nanoseconds += int(decimal) * (10 ** (9 - len(str(decimal))))
    return nanoseconds

def append_chapter(doc: Document, parent: Element, chapter_start_nanoseconds: int, chapter_end_nanoseconds: int):
    assert chapter_start_nanoseconds < chapter_end_nanoseconds, "Chapter start must be before end"

    chapter_atom = doc.createElement("ChapterAtom")

    chapter_start = doc.createElement("ChapterTimeStart")
    chapter_start.appendChild(doc.createTextNode(str(chapter_start_nanoseconds)))

    chapter_end = doc.createElement("ChapterTimeEnd")
    chapter_end.appendChild(doc.createTextNode(str(chapter_end_nanoseconds)))

    chapter_atom.appendChild(chapter_start)
    chapter_atom.appendChild(chapter_end)

    chapter_display = doc.createElement("ChapterDisplay")
    chapter_atom.appendChild(chapter_display)

    chapter_string = doc.createElement("ChapterString")
    chapter_string.appendChild(doc.createTextNode("N/A"))
    chapter_display.appendChild(chapter_string)

    chapter_language = doc.createElement("ChapterLanguage")
    chapter_language.appendChild(doc.createTextNode("heb"))
    chapter_display.appendChild(chapter_language)

    parent.appendChild(chapter_atom)


def convert_scenes(filename: str, output_file: str):
    impl = getDOMImplementation()

    doc = impl.createDocument(None, "Chapters", impl.createDocumentType("Chapters", None, "matroskachapters.dtd"))

    root = doc.documentElement
    assert root is not None, "Failed to create XML document root"

    edition = doc.createElement("EditionEntry")
    root.appendChild(edition)

    previous_chapter_time = None

    with open(filename, 'r', encoding='utf-8') as f:
        for line in f:
            m = DURATION_RE.match(line)
            if m:
                duration = m[1]
                duration_nanoseconds = parse_duration(duration)
                continue

            m = SCENE_RE.match(line)
            if m:
                chapter_time = m[1]
                chapter_seconds, chapter_decimal = chapter_time.split('.') if '.' in chapter_time else (chapter_time, '0')
                chapter_time_nanoseconds = int(chapter_seconds) * (10 ** 9)
                chapter_time_nanoseconds += int(chapter_decimal) * (10 ** (9 - len(chapter_decimal)))

                if previous_chapter_time is not None:
                    append_chapter(doc, edition, previous_chapter_time, chapter_time_nanoseconds)

                previous_chapter_time = chapter_time_nanoseconds


        assert previous_chapter_time is not None

        append_chapter(doc, edition, previous_chapter_time, duration_nanoseconds)

    with open(output_file, 'w') as f:
        doc.writexml(f, addindent="  ", newl="\n", encoding="UTF-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('filename', help='Input file containing raw scenes data from FFMPEG')
    parser.add_argument('-o', '--output', help='Output file for XML', required=False)
    args = parser.parse_args()

    if not os.path.isfile(args.filename):
        print(f"Error: File '{args.filename}' does not exist.")
        exit(1)

    name, ext = os.path.splitext(args.filename)
    name = os.path.basename(name)

    output_dir = os.path.dirname(args.filename)
    output_file = args.output if args.output else os.path.join(str(output_dir), f"{name}.chapters.xml")

    convert_scenes(args.filename, output_file)