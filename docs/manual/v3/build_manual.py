"""Arma el manual de usuario actualizado a partir del manual original.

Conserva las páginas originales (diseño y textos) y:
  - cambia sus capturas por las de la versión actual de la app (capturas/r*.jpg);
  - reemplaza el índice por indice.html;
  - inserta después de la sección 11 las secciones nuevas 12 a 21
    (secciones-12-21-novedades.html), con lo que se sumó al panel;
  - reemplaza la sección de WhatsApp con Twilio por la 23, WhatsApp Business con
    YCloud (seccion-23-whatsapp-ycloud.html);
  - renumera las secciones originales 12 a 17 como 22 a 27 y corrige las
    menciones a Twilio y la versión.

Uso (necesita PyMuPDF y la fuente Inter instalada), desde docs/manual/v3:
    1. Imprimir cada HTML a PDF con Chrome sin encabezados, por ejemplo:
       chrome --headless --no-pdf-header-footer --print-to-pdf=indice.pdf indice.html
       (igual con secciones-12-21-novedades.html y seccion-23-whatsapp-ycloud.html)
    2. python build_manual.py manual-base-v2.pdf indice.pdf secciones-12-21-novedades.pdf \
           seccion-23-whatsapp-ycloud.pdf ../Manual-de-usuario-ReservasIA-v3.pdf
"""

import sys

import pymupdf

INTER_DIR = "/usr/share/fonts/opentype/inter"
BEIGE_BOX = pymupdf.Rect(41.8, 41.8, 570.2, 750.2)
HEADER_TEXT = "RESERVASIA: MANUAL DE USUARIO"
HEADER_COLOR = (0x59 / 255, 0x59 / 255, 0x59 / 255)
LAST_PAGE_SECTION_11 = 20  # índice 0: página 21 del original (fin de la sección 11)
TELEGRAM_PAGE = 21  # página 22 del original (sección 12, Telegram)
OLD_WHATSAPP_PAGE = 22  # página 23 del original (sección 13 con Twilio + inicio de la 14), se descarta
ACCENT = "#b4513a"

# Captura del original (xref de la imagen) -> captura actual. Mismo tamaño y proporción.
SCREENSHOTS = {
    72: "r05-login.jpg",
    74: "r05-reservas-movil.jpg",
    93: "r08-resumen.jpg",
    107: "r10-lista.jpg",
    116: "r11-calendario.jpg",
    125: "r12-nueva-reserva.jpg",
    134: "r13-clientes.jpg",
    140: "r14-cliente.jpg",
    146: "r15-servicios.jpg",
    155: "r16-recursos.jpg",
    161: "r17-agente.jpg",
    167: "r18-inbox.jpg",
    173: "r19-integraciones.jpg",
    182: "r20-equipo.jpg",
    188: "r21-configuracion.jpg",
    193: "r21-oscuro.jpg",
}

# Etiquetas de sección del original que cambian de número: (página, número viejo, nuevo).
RENUMBERED_CHIPS = [(21, "12.", "22."), (23, "15.", "25."), (24, "16.", "26."), (25, "17.", "27.")]

CSS = """
@font-face { font-family: Inter; src: url(Inter-Regular.otf); }
@font-face { font-family: Inter; src: url(Inter-Bold.otf); font-weight: bold; }
@font-face { font-family: Inter; src: url(Inter-SemiBold.otf); font-weight: 600; }
body, p, b { font-family: Inter; margin: 0; padding: 0; line-height: 1.25; }
"""
ARCHIVE = pymupdf.Archive(INTER_DIR)


def rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def background_at(page: pymupdf.Page, rect: pymupdf.Rect) -> tuple[float, float, float]:
    """Color del fondo justo a la izquierda del texto (para tapar sin que se note)."""
    pix = page.get_pixmap(dpi=72, clip=pymupdf.Rect(rect.x0 - 3, rect.y0, rect.x0 - 1, rect.y1))
    r, g, b = pix.pixel(0, pix.height // 2)[:3]
    return (r / 255, g / 255, b / 255)


def replace_text(page: pymupdf.Page, rect: pymupdf.Rect, html: str, erase: pymupdf.Rect | None = None) -> None:
    """Borra el texto (de `erase`, o de todo `rect`) y escribe `html` en `rect`."""
    erase = erase or rect
    page.add_redact_annot(erase, fill=background_at(page, erase))
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    spare, _ = page.insert_htmlbox(rect, html, css=CSS, archive=ARCHIVE, scale_low=1)
    if spare < 0:
        raise SystemExit(f"El texto no entra en la página {page.number + 1}: {html[:60]}")


def stamp_header(page: pymupdf.Page, number: int, with_title: bool) -> None:
    if with_title:
        page.insert_text((42.0, 24.2), HEADER_TEXT, fontname="helv", fontsize=5.5, color=HEADER_COLOR)
    else:
        page.add_redact_annot(pymupdf.Rect(550, 16, 572, 27), fill=(1, 1, 1))
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    label = str(number)
    width = pymupdf.get_text_length(label, fontname="helv", fontsize=5.5)
    page.insert_text((570.0 - width, 24.2), label, fontname="helv", fontsize=5.5, color=HEADER_COLOR)


def patch_original(base: pymupdf.Document) -> None:
    ink, muted = "#2a2522", "#6b6355"

    cover = base[0]
    (r,) = cover.search_for("Versión del documento: septiembre 2026 · v2")
    replace_text(
        cover,
        pymupdf.Rect(150, r.y0 - 1, 462, r.y1 + 12),
        f'<p style="text-align:center;font-size:12.5pt;color:{muted}">Versión del documento: octubre 2026 · v3</p>',
        # Solo la línea de texto: la portada tiene un degradado y un parche más grande se notaría.
        erase=pymupdf.Rect(r.x0 - 1, r.y0, r.x1 + 1, r.y1 + 0.5),
    )

    integrations = base[18]
    first = integrations.search_for("Desde acá se conecta y desconecta cada canal")[0]
    last = integrations.search_for("Google Calendar), con credenciales propias y aisladas por negocio.")[0]
    replace_text(
        integrations,
        pymupdf.Rect(42, first.y0 - 1, 570.7, last.y1 + 24),
        f'<p style="font-size:12.5pt;line-height:19.4pt;color:{ink};text-align:justify">Desde acá se conecta y desconecta cada canal '
        "(Telegram, WhatsApp Business con YCloud y Google Calendar), con credenciales propias y aisladas por negocio. La conexión de "
        "WhatsApp con YCloud se explica paso a paso en la sección 23.</p>",
    )

    security = base[23]
    first = security.search_for("Credenciales de integraciones aisladas")[0]
    last = security.search_for("claves de Twilio de un negocio nunca son visibles ni accesibles para otro).")[0]
    replace_text(
        security,
        pymupdf.Rect(62, first.y0 - 1, 570.7, last.y1 + 8),
        f'<p style="font-size:12.5pt;line-height:18.7pt;color:{ink};text-align:justify"><b>Credenciales de integraciones aisladas</b> por '
        "negocio (el token de Telegram o la API key de YCloud de un negocio nunca son visibles ni accesibles para otro).</p>",
    )

    plans = base[24]
    (r,) = plans.search_for("Canal WhatsApp (Twilio)")
    replace_text(
        plans,
        pymupdf.Rect(r.x0, r.y0 - 1, 560, r.y1 + 9),
        f'<p style="font-size:11pt;color:{ink}">Canal WhatsApp Business (YCloud)</p>',
    )

    references = base[25]
    line = references.search_for("de la sección 15.")[0]
    (old,) = references.search_for("15.", clip=line)
    retype(references, old, "25.", "Inter-Regular.otf", 10.5, muted, fill=rgb("#f5f0e3"))

    for page_index, old_label, new_label in RENUMBERED_CHIPS:
        page = base[page_index]
        (old,) = [r for r in page.search_for(old_label) if r.x0 < 60 and r.height < 12]
        retype(page, old, new_label, "Inter-Bold.otf", 9.5, ACCENT, letter_spacing=0.5)

    for xref, name in SCREENSHOTS.items():
        page = next(p for p in base if xref in [img[0] for img in p.get_images()])
        page.replace_image(xref, filename=f"capturas/{name}")


def retype(
    page: pymupdf.Page,
    rect: pymupdf.Rect,
    text: str,
    font: str,
    size: float,
    color: str,
    letter_spacing: float = 0,
    fill: tuple[float, float, float] | None = None,
) -> None:
    """Cambia un texto corto (un número) por otro, en la misma línea de base."""
    span = next(
        s for b in page.get_text("dict", clip=rect)["blocks"] for l in b.get("lines", []) for s in l["spans"] if s["text"].strip()
    )
    erase = pymupdf.Rect(rect.x0 - 0.5, rect.y0, rect.x1, rect.y1)
    page.add_redact_annot(erase, fill=fill or background_at(page, erase))
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    fontfile = f"{INTER_DIR}/{font}"
    measure = pymupdf.Font(fontfile=fontfile)
    x, y = span["origin"]
    for char in text:
        page.insert_text((x, y), char, fontname=font.split(".")[0], fontfile=fontfile, fontsize=size, color=rgb(color))
        x += measure.text_length(char, size) + letter_spacing


def with_background(path: str) -> pymupdf.Document:
    doc = pymupdf.open(path)
    for page in doc:
        page.draw_rect(BEIGE_BOX, color=None, fill=rgb("#f5f0e3"), overlay=False)
    return doc


def main(base_path: str, index_path: str, news_path: str, whatsapp_path: str, out_path: str) -> None:
    base = pymupdf.open(base_path)
    patch_original(base)
    index, news, whatsapp = (with_background(p) for p in (index_path, news_path, whatsapp_path))

    out = pymupdf.open()
    new_pages = set()

    def add(doc: pymupdf.Document, first: int = 0, last: int = -1, is_new: bool = False) -> None:
        last = doc.page_count - 1 if last < 0 else last
        start = out.page_count
        out.insert_pdf(doc, from_page=first, to_page=last)
        if is_new:
            new_pages.update(range(start, out.page_count))

    add(base, 0, 0)
    add(index, is_new=True)
    add(base, 2, LAST_PAGE_SECTION_11)
    add(news, is_new=True)
    add(base, TELEGRAM_PAGE, TELEGRAM_PAGE)
    add(whatsapp, is_new=True)
    add(base, OLD_WHATSAPP_PAGE + 1)

    for i in range(1, out.page_count):
        if i in new_pages or i >= LAST_PAGE_SECTION_11 + 1:
            stamp_header(out[i], i + 1, with_title=i in new_pages)

    out.set_metadata({**base.metadata, "title": "ReservasIA: manual de usuario (v3)"})
    out.subset_fonts()
    out.save(out_path, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, use_objstms=1)
    print(f"{out_path}: {out.page_count} páginas")


if __name__ == "__main__":
    main(*sys.argv[1:6])
