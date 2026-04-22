#!/usr/bin/env python3
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EPUB_PATH = ROOT / "app/src/debug/assets/fixtures/readio_spike.epub"

FIXED_DT = (2020, 1, 1, 0, 0, 0)

container_xml = """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\">
  <rootfiles>
    <rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/>
  </rootfiles>
</container>
"""

content_opf = """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<package version=\"3.0\" xmlns=\"http://www.idpf.org/2007/opf\" unique-identifier=\"bookid\">
  <metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\">
    <dc:identifier id=\"bookid\">readio-spike-epub</dc:identifier>
    <dc:title>Readio Spike EPUB</dc:title>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>
    <item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/>
    <item id=\"chapter1\" href=\"chapter1.xhtml\" media-type=\"application/xhtml+xml\"/>
    <item id=\"chapter2\" href=\"chapter2.xhtml\" media-type=\"application/xhtml+xml\"/>
  </manifest>
  <spine>
    <itemref idref=\"chapter1\"/>
    <itemref idref=\"chapter2\"/>
  </spine>
</package>
"""

nav_xhtml = """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\">
  <head><title>Navigation</title></head>
  <body>
    <nav epub:type=\"toc\" id=\"toc\">
      <ol>
        <li><a href=\"chapter1.xhtml\">第1章 风起</a></li>
        <li><a href=\"chapter2.xhtml\">第2章 夜路</a></li>
      </ol>
    </nav>
  </body>
</html>
"""

chapter1_xhtml = """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\">
  <head>
    <title>第1章 风起</title>
    <meta charset=\"utf-8\"/>
  </head>
  <body>
    <h1>第1章 风起</h1>
    <p>林深第一次看见那盏旧灯。</p>
  </body>
</html>
"""

chapter2_xhtml = """<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE html>
<html xmlns=\"http://www.w3.org/1999/xhtml\">
  <head>
    <title>第2章 夜路</title>
    <meta charset=\"utf-8\"/>
  </head>
  <body>
    <h1>第2章 夜路</h1>
    <p>雨停之后，街口只剩脚步声。</p>
  </body>
</html>
"""


def write_entry(epub: zipfile.ZipFile, name: str, content: str, stored: bool = False) -> None:
    info = zipfile.ZipInfo(name)
    info.date_time = FIXED_DT
    info.create_system = 0
    info.external_attr = 0
    compress = zipfile.ZIP_STORED if stored else zipfile.ZIP_DEFLATED
    epub.writestr(info, content.encode("utf-8"), compress_type=compress)


with zipfile.ZipFile(EPUB_PATH, "w") as epub:
    write_entry(epub, "mimetype", "application/epub+zip", stored=True)
    write_entry(epub, "META-INF/container.xml", container_xml)
    write_entry(epub, "OEBPS/content.opf", content_opf)
    write_entry(epub, "OEBPS/nav.xhtml", nav_xhtml)
    write_entry(epub, "OEBPS/chapter1.xhtml", chapter1_xhtml)
    write_entry(epub, "OEBPS/chapter2.xhtml", chapter2_xhtml)

print(EPUB_PATH)
