#!/usr/bin/env python3
from pathlib import Path

from reportlab import rl_config
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "app/src/debug/assets/fixtures/readio_spike.pdf"

rl_config.invariant = 1

lines = [
    "Readio Spike PDF",
    "Page 1",
]

pdf = canvas.Canvas(str(PDF_PATH), pagesize=LETTER)
pdf.setTitle("Readio Spike PDF")
pdf.setAuthor("Readio")
pdf.setSubject("Deterministic fixture")
pdf.setCreator("generate_spike_pdf.py")
pdf.setProducer("Readio")

_, height = LETTER
y = height - 72
pdf.setFont("Helvetica", 12)
for line in lines:
    if y < 72:
        pdf.showPage()
        pdf.setFont("Helvetica", 12)
        y = height - 72
    pdf.drawString(72, y, line)
    y -= 18
pdf.save()

print(PDF_PATH)
