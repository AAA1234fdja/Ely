#!/usr/bin/env python3
"""Render docs/guia-ely-cowork.md as a styled PDF (requires ReportLab)."""
from __future__ import annotations

import html
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, KeepTogether, ListFlowable, ListItem,
    NextPageTemplate, PageBreak, PageTemplate, Paragraph, Preformatted, Spacer, Table, TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "guia-ely-cowork.md"
OUTPUT = ROOT / "docs" / "guia-ely-cowork.pdf"

NAVY = colors.HexColor("#111833")
ACCENT = colors.HexColor("#6878F4")
CYAN = colors.HexColor("#35C5D3")
INK = colors.HexColor("#202941")
MUTED = colors.HexColor("#68738C")
PAPER = colors.HexColor("#F5F7FC")
RULE = colors.HexColor("#DDE3F0")

FONT_DIRS = [
    Path("/usr/share/fonts/truetype/dejavu"),
    Path("/usr/share/fonts/dejavu"),
]

def font_file(name: str) -> Path:
    for base in FONT_DIRS:
        candidate = base / name
        if candidate.is_file():
            return candidate
    raise RuntimeError("No se encontró DejaVu Sans; instala las fuentes DejaVu antes de renderizar.")

pdfmetrics.registerFont(TTFont("ElySans", str(font_file("DejaVuSans.ttf"))))
pdfmetrics.registerFont(TTFont("ElySans-Bold", str(font_file("DejaVuSans-Bold.ttf"))))
pdfmetrics.registerFont(TTFont("ElyMono", str(font_file("DejaVuSansMono.ttf"))))
pdfmetrics.registerFontFamily("ElySans", normal="ElySans", bold="ElySans-Bold", italic="ElySans", boldItalic="ElySans-Bold")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverKicker", fontName="ElySans-Bold", fontSize=9, leading=13,
                          textColor=CYAN, tracking=1.5, spaceAfter=12))
styles.add(ParagraphStyle(name="CoverTitle", fontName="ElySans-Bold", fontSize=31, leading=38,
                          textColor=colors.white, spaceAfter=10))
styles.add(ParagraphStyle(name="CoverSub", fontName="ElySans", fontSize=15, leading=22,
                          textColor=colors.HexColor("#C9D3F0"), spaceAfter=22))
styles.add(ParagraphStyle(name="CoverBody", fontName="ElySans", fontSize=10.5, leading=17,
                          textColor=colors.HexColor("#E8ECFA"), spaceAfter=10))
styles.add(ParagraphStyle(name="H1Ely", fontName="ElySans-Bold", fontSize=21, leading=27,
                          textColor=NAVY, spaceBefore=4, spaceAfter=12, keepWithNext=True))
styles.add(ParagraphStyle(name="H2Ely", fontName="ElySans-Bold", fontSize=13.5, leading=18,
                          textColor=ACCENT, spaceBefore=11, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name="H3Ely", fontName="ElySans-Bold", fontSize=10.5, leading=15,
                          textColor=INK, spaceBefore=8, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle(name="BodyEly", fontName="ElySans", fontSize=9.2, leading=14.1,
                          textColor=INK, spaceAfter=7, alignment=TA_LEFT, splitLongWords=True))
styles.add(ParagraphStyle(name="BulletEly", parent=styles["BodyEly"], leftIndent=13, firstLineIndent=-8,
                          bulletIndent=0, spaceAfter=4))
styles.add(ParagraphStyle(name="TableEly", fontName="ElySans", fontSize=7.8, leading=11,
                          textColor=INK, spaceAfter=0))
styles.add(ParagraphStyle(name="TableHeadEly", fontName="ElySans-Bold", fontSize=7.8, leading=11,
                          textColor=colors.white, spaceAfter=0))
styles.add(ParagraphStyle(name="SmallEly", fontName="ElySans", fontSize=8, leading=11,
                          textColor=MUTED, spaceAfter=4))
styles.add(ParagraphStyle(name="CodeEly", fontName="ElyMono", fontSize=7.8, leading=11,
                          textColor=colors.HexColor("#DDE6FF")))

INLINE_RE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^\)]+\))")

def inline(text: str) -> str:
    out = []
    pos = 0
    for match in INLINE_RE.finditer(text):
        out.append(escape(text[pos:match.start()]))
        token = match.group(0)
        if token.startswith("**"):
            out.append("<b>" + escape(token[2:-2]) + "</b>")
        elif token.startswith("`"):
            out.append('<font name="ElyMono" color="#4B5DAA">' + escape(token[1:-1]) + "</font>")
        elif token.startswith("*"):
            out.append("<i>" + escape(token[1:-1]) + "</i>")
        else:
            label, url = re.match(r"\[([^\]]+)\]\(([^\)]+)\)", token).groups()
            out.append(f'<link href="{html.escape(url, quote=True)}" color="#5267D8">{escape(label)}</link>')
        pos = match.end()
    out.append(escape(text[pos:]))
    return "".join(out)

class ArchitectureDiagram(Flowable):
    def __init__(self, width: float):
        super().__init__()
        self.width = width
        self.height = 112

    def wrap(self, availWidth, availHeight):
        self.width = availWidth
        return self.width, self.height

    def draw(self):
        c = self.canv
        labels = [
            ("CHAT / CLI", "Petición, perfil y calidad"),
            ("MOTOR ELY", "Contexto, permisos y límites"),
            ("HARNESS²", "Esfuerzo, tokens y prompt"),
            ("PROVEEDOR", "Modelo remoto o compatible local"),
            ("HERRAMIENTAS", "Workspace y MCP habilitado"),
            ("EVIDENCIA", "Resultado, uso y verificación"),
        ]
        gap_x, gap_y = 12, 12
        card_w = (self.width - gap_x) / 2
        card_h = 30
        starts = [(0, 2), (1, 2), (0, 1), (1, 1), (0, 0), (1, 0)]
        boxes = {}
        for i, (col, row) in enumerate(starts):
            x = col * (card_w + gap_x)
            y = row * (card_h + gap_y)
            boxes[i] = (x, y)
            c.setFillColor(colors.white)
            c.setStrokeColor(RULE)
            c.roundRect(x, y, card_w, card_h, 6, fill=1, stroke=1)
            c.setFillColor(ACCENT if i < 3 else NAVY)
            c.setFont("ElySans-Bold", 7.2)
            c.drawString(x + 9, y + 18, labels[i][0])
            c.setFillColor(MUTED)
            c.setFont("ElySans", 6.4)
            c.drawString(x + 9, y + 7, labels[i][1])
        # Direction arrows make the relationship clear without implying a strict DAG.
        for start, end in ((0, 1), (2, 3), (4, 5)):
            x1, y1 = boxes[start]
            x2, y2 = boxes[end]
            x = x1 + card_w + 2
            y = y1 + card_h / 2
            c.setStrokeColor(CYAN)
            c.setFillColor(CYAN)
            c.setLineWidth(1.4)
            c.line(x, y, x2 - 3, y)
            c.line(x2 - 3, y, x2 - 7, y + 3)
            c.line(x2 - 3, y, x2 - 7, y - 3)
        c.setFillColor(MUTED)
        c.setFont("ElySans", 6.2)
        c.drawCentredString(self.width / 2, -9, "El modelo puede pedir herramientas; Ely autoriza, ejecuta y devuelve los resultados como datos.")

class ElyDoc(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(filename, pagesize=letter, title="Ely Cowork — Guía del producto",
                         author="Photon Labs", subject="Descripción y funcionamiento de Ely Cowork",
                         leftMargin=18*mm, rightMargin=18*mm, topMargin=20*mm, bottomMargin=17*mm)
        cover_frame = Frame(22*mm, 22*mm, letter[0]-44*mm, letter[1]-44*mm,
                            id="cover", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        body_frame = Frame(18*mm, 17*mm, letter[0]-36*mm, letter[1]-37*mm,
                           id="body", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame], onPage=self.cover_page),
            PageTemplate(id="body", frames=[body_frame], onPage=self.body_page),
        ])

    def cover_page(self, canvas, doc):
        w, h = letter
        canvas.saveState()
        canvas.setFillColor(NAVY)
        canvas.rect(0, 0, w, h, stroke=0, fill=1)
        canvas.setStrokeColor(colors.HexColor("#26325B"))
        canvas.setLineWidth(1)
        for i in range(7):
            canvas.circle(w + 40 - i*23, h - 90 + i*17, 90 + i*12, stroke=1, fill=0)
        canvas.setFillColor(ACCENT)
        canvas.roundRect(44, h-112, 38, 38, 11, stroke=0, fill=1)
        canvas.setStrokeColor(colors.white)
        canvas.setLineWidth(1.7)
        canvas.line(55, h-93, 64, h-88)
        canvas.line(64, h-88, 72, h-93)
        canvas.line(55, h-93, 55, h-103)
        canvas.line(55, h-103, 64, h-108)
        canvas.line(64, h-108, 72, h-103)
        canvas.line(72, h-103, 72, h-93)
        canvas.restoreState()

    def body_page(self, canvas, doc):
        w, h = letter
        canvas.saveState()
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, w, h, stroke=0, fill=1)
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.6)
        canvas.line(18*mm, h-13*mm, w-18*mm, h-13*mm)
        canvas.setFillColor(NAVY)
        canvas.setFont("ElySans-Bold", 8)
        canvas.drawString(18*mm, h-10*mm, "ELY COWORK")
        canvas.setFillColor(MUTED)
        canvas.setFont("ElySans", 7.2)
        canvas.drawRightString(w-18*mm, h-10*mm, "GUÍA DEL PRODUCTO")
        canvas.line(18*mm, 12*mm, w-18*mm, 12*mm)
        canvas.setFont("ElySans", 7)
        canvas.drawString(18*mm, 8*mm, "Photon Labs · 2 nov 2026")
        canvas.drawRightString(w-18*mm, 8*mm, f"{doc.page - 1}")
        canvas.restoreState()

def parse_table(lines: list[str], width: float):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells):
            continue
        rows.append(cells)
    if not rows:
        return Spacer(1, 1)
    columns = max(len(r) for r in rows)
    rows = [r + [""] * (columns-len(r)) for r in rows]
    cooked = []
    for ri, row in enumerate(rows):
        style = styles["TableHeadEly"] if ri == 0 else styles["TableEly"]
        cooked.append([Paragraph(inline(cell), style) for cell in row])
    weights = [1.05] + [1] * (columns-1)
    total = sum(weights)
    widths = [width * x / total for x in weights]
    table = Table(cooked, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY),
        ("BACKGROUND", (0,1), (-1,-1), colors.white),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F0F3FA")]),
        ("GRID", (0,0), (-1,-1), 0.35, RULE),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    return table

def render():
    source = SOURCE.read_text(encoding="utf-8")
    doc = ElyDoc(str(OUTPUT))
    width = letter[0] - 36*mm
    story = [Spacer(1, 58*mm),
             Paragraph("GUÍA DE PRODUCTO · VERSIÓN 1.0", styles["CoverKicker"]),
             Paragraph("Ely Cowork", styles["CoverTitle"]),
             Paragraph("Qué es, cómo funciona y cómo usarlo", styles["CoverSub"]),
             Paragraph("Un espacio de trabajo para conversar con modelos, coordinar agentes especializados y operar sobre proyectos con herramientas y controles de calidad.", styles["CoverBody"]),
             Spacer(1, 18*mm),
             Paragraph("CHAT · AGENTES · HERRAMIENTAS · CALIDAD", styles["CoverKicker"]),
             Spacer(1, 44*mm),
             Paragraph("Photon Labs  /  2 de noviembre de 2026", ParagraphStyle("CoverMeta", fontName="ElySans", fontSize=8.5, textColor=colors.HexColor("#A9B5D7"))),
             NextPageTemplate("body"), PageBreak()]
    lines = source.splitlines()
    i = 0
    in_code = False
    code_lines: list[str] = []
    while i < len(lines):
        raw = lines[i].rstrip()
        stripped = raw.strip()
        if stripped == "<!-- PAGEBREAK -->":
            story.append(PageBreak())
            i += 1
            continue
        if stripped.startswith("```"):
            if not in_code:
                in_code = True
                code_lines = []
            else:
                block = Preformatted("\n".join(code_lines), styles["CodeEly"], maxLineLength=94)
                panel = Table([[block]], colWidths=[width])
                panel.setStyle(TableStyle([
                    ("BACKGROUND", (0,0), (-1,-1), NAVY),
                    ("BOX", (0,0), (-1,-1), 0.5, NAVY),
                    ("LEFTPADDING", (0,0), (-1,-1), 9),
                    ("RIGHTPADDING", (0,0), (-1,-1), 9),
                    ("TOPPADDING", (0,0), (-1,-1), 8),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
                ]))
                story.extend([panel, Spacer(1, 7)])
                in_code = False
            i += 1
            continue
        if in_code:
            code_lines.append(raw)
            i += 1
            continue
        if not stripped:
            i += 1
            continue
        if stripped == "<!-- DIAGRAM -->":
            story.extend([ArchitectureDiagram(width), Spacer(1, 8)])
            i += 1
            continue
        if stripped.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            story.extend([parse_table(table_lines, width), Spacer(1, 9)])
            continue
        if stripped.startswith("# "):
            story.append(Paragraph(inline(stripped[2:]), styles["H1Ely"]))
        elif stripped.startswith("## "):
            story.append(Paragraph(inline(stripped[3:]), styles["H2Ely"]))
        elif stripped.startswith("### "):
            story.append(Paragraph(inline(stripped[4:]), styles["H3Ely"]))
        elif stripped.startswith("- "):
            items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append(ListItem(Paragraph(inline(lines[i].strip()[2:]), styles["BulletEly"]), leftIndent=10))
                i += 1
            story.append(ListFlowable(items, bulletType="bullet", start="circle", leftIndent=11,
                                      bulletFontName="ElySans", bulletFontSize=5, bulletColor=ACCENT,
                                      spaceAfter=5))
            continue
        elif re.match(r"^\d+\. ", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i].strip()):
                text = re.sub(r"^\d+\. ", "", lines[i].strip())
                items.append(ListItem(Paragraph(inline(text), styles["BulletEly"]), leftIndent=12))
                i += 1
            story.append(ListFlowable(items, bulletType="1", start="1", leftIndent=13,
                                      bulletFontName="ElySans-Bold", bulletFontSize=8, bulletColor=ACCENT,
                                      spaceAfter=6))
            continue
        else:
            # Join soft-wrapped Markdown source lines into a single paragraph.
            para = [stripped]
            i += 1
            while i < len(lines):
                next_line = lines[i].strip()
                if (not next_line or next_line.startswith(("# ", "## ", "### ", "- ", "|", "```", "<!--"))
                        or re.match(r"^\d+\. ", next_line)):
                    break
                para.append(next_line)
                i += 1
            story.append(Paragraph(inline(" ".join(para)), styles["BodyEly"]))
            continue
        i += 1
    doc.build(story)
    print(f"PDF generado: {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes)")

if __name__ == "__main__":
    render()
