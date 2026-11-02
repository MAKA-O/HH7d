"""Конвертация документации из Markdown в Word (.docx) через pandoc.

Запуск:
    .venv\\Scripts\\python.exe tools\\md_to_docx.py
Результат: docs/word/*.docx (плюс проверка через python-docx).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pypandoc

DOCS = Path(__file__).resolve().parent.parent / "docs"
OUT_DIR = DOCS / "word"

FILES = {
    "01-ТЗ.md": "01-TZ.docx",
    "02-Архитектура.md": "02-Architecture.docx",
    "03-Сценарии.md": "03-Scenarios.docx",
    "04-ПЗ.md": "04-PZ.docx",
    "05-Тестирование.md": "05-Testing.docx",
    "06-Дизайн-система.md": "06-Design-System.docx",
    "API.md": "07-API.docx",
}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    converted: list[Path] = []
    for source_name, target_name in FILES.items():
        source = DOCS / source_name
        if not source.exists():
            print(f"[skip] нет файла {source_name}")
            continue
        target = OUT_DIR / target_name
        pypandoc.convert_file(
            str(source),
            "docx",
            outputfile=str(target),
            extra_args=[
                "--standalone",
                "--toc",
                "--toc-depth=2",
                "--metadata",
                "lang=ru-RU",
                "--metadata",
                "toc-title=Содержание",
                "--resource-path",
                str(DOCS),
            ],
        )
        size_kb = target.stat().st_size / 1024
        converted.append(target)
        print(f"[ok] {source_name} -> {target.name} ({size_kb:.0f} KB)")

    # Проверка: документы открываются и содержат текст
    try:
        from docx import Document
    except ImportError:
        print("python-docx недоступен — проверка пропущена")
        return 0 if converted else 1

    print("\nПроверка документов:")
    for path in converted:
        document = Document(str(path))
        text_words = sum(len(p.text.split()) for p in document.paragraphs)
        tables = len(document.tables)
        print(f"  {path.name}: абзацев={len(document.paragraphs)}, слов~{text_words}, таблиц={tables}")
        if len(document.paragraphs) < 10 or text_words < 100:
            print(f"  [WARN] документ подозрительно пустой: {path.name}")
            return 1

    print(f"\nГотово: {len(converted)} документов в {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
