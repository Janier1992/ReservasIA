"""Arma el manual de usuario actualizado a partir del manual original.

Conserva las páginas originales (diseño y capturas), reemplaza la sección 13
(WhatsApp con Twilio) por las páginas de WhatsApp Business con YCloud y
corrige las demás menciones a Twilio, la versión y la numeración.

Uso (necesita PyMuPDF y la fuente Inter instalada), desde docs/manual/v3:
    1. Imprimir seccion-13-whatsapp-ycloud.html a PDF con Chrome sin encabezados:
       chrome --headless --no-pdf-header-footer --print-to-pdf=seccion-13.pdf seccion-13-whatsapp-ycloud.html
    2. python build_manual.py manual-base-v2.pdf seccion-13.pdf ../Manual-de-usuario-ReservasIA-v3.pdf
"""

import sys

import pymupdf

INTER_DIR = "/usr/share/fonts/opentype/inter"
BEIGE_BOX = pymupdf.Rect(41.8, 41.8, 570.2, 750.2)
HEADER_TEXT = "RESERVASIA: MANUAL DE USUARIO"
HEADER_COLOR = (0x59 / 255, 0x59 / 255, 0x59 / 255)
OLD_SECTION_13_PAGE = 22  # índice 0: página 23 del original (sección 13 + inicio de la 14)

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

    index = base[1]
    (title,) = index.search_for("WhatsApp: preparado para activarse")
    (note,) = index.search_for("Qué falta y qué implica")
    replace_text(
        index,
        pymupdf.Rect(title.x0, title.y0 - 1, 330, title.y1 + 9),
        f'<p style="font-size:13pt;color:{ink}">WhatsApp Business con YCloud</p>',
    )
    title_width = pymupdf.Font(fontfile=f"{INTER_DIR}/Inter-Regular.otf").text_length("WhatsApp Business con YCloud", 13)
    pill_x = title.x0 + title_width + 8
    pill = pymupdf.Rect(pill_x, title.y0 + 2, pill_x + 36, title.y1 - 0.5)
    index.draw_rect(pill, color=None, fill=rgb("#f0ded3"), radius=0.5)
    index.insert_htmlbox(
        pill + (0, 2.2, 0, 0),
        '<p style="font-size:7pt;font-weight:bold;color:#b4513a;text-align:center">Nuevo</p>',
        css=CSS,
        archive=ARCHIVE,
        scale_low=1,
    )
    replace_text(
        index,
        pymupdf.Rect(340, note.y0 - 1, note.x1 + 0.5, note.y1 + 9),
        f'<p style="font-size:10.5pt;color:{muted};text-align:right">Paso a paso, con tu mismo número</p>',
    )

    integrations = base[18]
    first = integrations.search_for("Desde acá se conecta y desconecta cada canal")[0]
    last = integrations.search_for("Google Calendar), con credenciales propias y aisladas por negocio.")[0]
    replace_text(
        integrations,
        pymupdf.Rect(42, first.y0 - 1, 570.7, last.y1 + 24),
        f'<p style="font-size:12.5pt;line-height:19.4pt;color:{ink};text-align:justify">Desde acá se conecta y desconecta cada canal '
        "(Telegram, WhatsApp Business con YCloud y Google Calendar), con credenciales propias y aisladas por negocio. La conexión de "
        "WhatsApp con YCloud se explica paso a paso en la sección 13.</p>",
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


def main(base_path: str, section_path: str, out_path: str) -> None:
    base = pymupdf.open(base_path)
    section = pymupdf.open(section_path)
    patch_original(base)

    for page in section:
        page.draw_rect(BEIGE_BOX, color=None, fill=rgb("#f5f0e3"), overlay=False)

    out = pymupdf.open()
    out.insert_pdf(base, from_page=0, to_page=OLD_SECTION_13_PAGE - 1)
    out.insert_pdf(section)
    out.insert_pdf(base, from_page=OLD_SECTION_13_PAGE + 1, to_page=base.page_count - 1)

    first_new = OLD_SECTION_13_PAGE
    for i in range(first_new, out.page_count):
        is_new = i < first_new + section.page_count
        stamp_header(out[i], i + 1, with_title=is_new)

    out.set_metadata({**base.metadata, "title": "ReservasIA: manual de usuario (v3)"})
    out.subset_fonts()
    out.save(out_path, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, use_objstms=1)
    print(f"{out_path}: {out.page_count} páginas")


if __name__ == "__main__":
    main(*sys.argv[1:4])
