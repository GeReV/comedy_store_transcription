"""
Convert all SRT (and JSON) files under files/ to UTF-8 in-place.
Tries common Hebrew encodings as fallbacks.
"""
from pathlib import Path

ROOT = Path(__file__).parent.parent
FILES_DIR = ROOT / "files"

# Ordered by likelihood for Hebrew content
FALLBACK_ENCODINGS = ["utf-8-sig", "windows-1255", "cp1255", "iso-8859-8", "latin-1"]


def decode_best(raw: bytes, path: Path) -> tuple[str, str]:
    """Return (text, encoding_used). Raises if nothing works."""
    for enc in FALLBACK_ENCODINGS:
        try:
            return raw.decode(enc), enc
        except (UnicodeDecodeError, LookupError):
            continue
    raise ValueError(f"Could not decode {path} with any known encoding")


def convert_file(path: Path) -> bool:
    """Return True if the file was re-written."""
    raw = path.read_bytes()
    try:
        raw.decode("utf-8")
        return False  # Already valid UTF-8, nothing to do
    except UnicodeDecodeError:
        pass

    text, enc = decode_best(raw, path)
    path.write_text(text, encoding="utf-8")
    print(f"  Converted ({enc} → utf-8): {path.relative_to(ROOT)}")
    return True


def main():
    converted = 0
    errors = 0

    for ext in ("*.srt", "*.json"):
        for p in sorted(FILES_DIR.rglob(ext)):
            try:
                if convert_file(p):
                    converted += 1
            except Exception as e:
                print(f"  ERROR: {p.relative_to(ROOT)}: {e}")
                errors += 1

    print(f"\nDone. {converted} files converted, {errors} errors.")


if __name__ == "__main__":
    main()
