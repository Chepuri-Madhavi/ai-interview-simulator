"""PDF version of the interview report (ReportLab)."""
import io
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from ..models import Interview
from .prompts import CATEGORY_NAMES

ACCENT = colors.HexColor("#0E6B58")
MUTED = colors.HexColor("#5A645D")


def _p(text, style):
    # Questions may be in Telugu; the built-in PDF fonts cannot draw Telugu script, so replace it with a marker.
    safe = "".join(ch if ord(ch) < 0x0C00 or ord(ch) > 0x0C7F else "" for ch in str(text or ""))
    if safe != str(text or "") and not safe.strip(" ?.,"):
        safe = "[Telugu text - see the report in the app]"
    return Paragraph(escape(safe), style)


def build_pdf(iv: Interview) -> bytes:
    r = iv.report or {}
    scores = r.get("scores", {})
    ss = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Heading1"], textColor=colors.HexColor("#1A211D"), fontSize=18)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=ACCENT, fontSize=13, spaceBefore=10)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=9.5, leading=13)
    small = ParagraphStyle("s", parent=body, fontSize=8.5, textColor=MUTED)
    bullet = ParagraphStyle("bl", parent=body, leftIndent=10, bulletIndent=2)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title="Interview report", author="AI Interview Simulator")
    story = [
        _p("Interview report: " + iv.role_title, h1),
        _p(f"{iv.created_at:%d %b %Y} | {iv.interview_type} | {iv.difficulty} | {iv.language} | "
           f"{r.get('answered', 0)} answers scored | {iv.elapsed_seconds // 60} min", small),
        Spacer(1, 6),
        _p(f"Overall score: {scores.get('overall', '-')}%   Readiness: {r.get('readiness', {}).get('verdict', '-')}", h2),
        _p(r.get("headline", ""), body),
        _p(r.get("readiness", {}).get("summary", ""), body),
    ]

    labels, values = [], []
    for key, name in [*CATEGORY_NAMES.items(), ("communication", "Communication")]:
        labels.append(f"{name} ({scores.get(key) if scores.get(key) is not None else 'n/a'})")
        values.append(scores.get(key) or 0)
    d = Drawing(170 * mm, 70 * mm)
    chart = HorizontalBarChart()
    chart.x, chart.y, chart.width, chart.height = 48 * mm, 4 * mm, 115 * mm, 62 * mm
    chart.data = [list(reversed(values))]
    chart.categoryAxis.categoryNames = list(reversed(labels))
    chart.categoryAxis.labels.fontSize = 7.5
    chart.valueAxis.valueMin, chart.valueAxis.valueMax, chart.valueAxis.valueStep = 0, 100, 20
    chart.valueAxis.labels.fontSize = 7
    chart.bars[0].fillColor = ACCENT
    chart.bars[0].strokeColor = None
    d.add(chart)
    story += [_p("Scores by area (0-100)", h2), d]

    def bullets(title, items, fmt=lambda x: x):
        if items:
            story.append(_p(title, h2))
            story.extend(_p(fmt(x), bullet) for x in items)

    bullets("Strongest areas", r.get("strongest_areas", []))
    bullets("Weakest areas", r.get("weakest_areas", []))
    bullets("Topics to revise", r.get("topics_to_revise", []), lambda t: f"{t['topic']}: {t['why']}")
    bullets("Recommended next steps", r.get("next_steps", []))
    bullets("Questions answered incorrectly or not answered", r.get("incorrect", []), lambda x: f"{x['question']} ({x['score']}/10)")

    story += [PageBreak(), _p("Answer-by-answer feedback", h1)]
    n = 0
    for q in iv.questions:
        a = q.answer
        if not a or not a.evaluation:
            continue
        n += 1
        e = a.evaluation
        story.append(_p(f"Q{n}. [{CATEGORY_NAMES[q.category]}] {q.text}", h2))
        story.append(_p(f"Score {e['score']}/10 - {e['verdict']}", body))
        story.append(_p("Your answer: " + ("(skipped)" if a.skipped else a.transcript or "(empty)"), small))
        rub = [[k.replace("_", " ").title(), str(v)] for k, v in e["rubric"].items()]
        cells = sum(rub, []) + [""] * (8 - (len(rub) * 2) % 8 if (len(rub) * 2) % 8 else 0)
        t = Table([cells[i:i + 8] for i in range(0, len(cells), 8)], hAlign="LEFT")
        t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 7.5), ("TEXTCOLOR", (0, 0), (-1, -1), MUTED),
                               ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D7DBD2"))]))
        story.append(t)
        for title, key in [("What you got right", "correct_points"), ("Missing points", "missing_points"), ("Technical mistakes", "mistakes")]:
            if e.get(key):
                story.append(_p(title, ParagraphStyle("t", parent=body, fontName="Helvetica-Bold")))
                story.extend(_p(x, bullet) for x in e[key])
        if e.get("how_to_improve"):
            story.append(_p("How to improve: " + e["how_to_improve"], body))
        if e.get("stronger_answer"):
            story.append(_p("A stronger answer: " + e["stronger_answer"], small))
    doc.build(story)
    return buf.getvalue()
