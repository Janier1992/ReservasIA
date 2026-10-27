"""Genera indice.html (página 2 del manual). Uso, desde docs/manual/v3: python build_index.py"""

rows = [
 ("¿Qué es ReservasIA?", "Propuesta de valor y para quién es", 0),
 ("Cómo funciona", "El recorrido de una reserva, en simple", 0),
 ("Adaptado a cada rubro", "Qué pregunta el agente según tu negocio", 1),
 ("El panel de control (Resumen)", "Estadísticas y reportes del negocio", 0),
 ("Reservas", "Lista, calendario semanal y creación manual", 0),
 ("Clientes", "Historial, notas y datos de contacto", 0),
 ("Servicios y Recursos", "El catálogo que usa el agente", 0),
 ("Agente de IA", "Personalidad, reglas y vista previa", 0),
 ("Inbox", "Conversaciones en vivo por canal", 0),
 ("Integraciones y Equipo", "Canales conectados y accesos", 0),
 ("Configuración y apariencia", "Datos del negocio, tema claro/oscuro", 0),
 ("Crear la cuenta y prueba gratis", "Registro, asistente y acceso", 1),
 ("Novedades en reservas", "Tablero, bloqueos, cobros y series", 1),
 ("Fichas de clientes según el rubro", "Vehículos, mascotas y preferencias", 1),
 ("Carta, menú del día y horarios", "Agotados y horario de cada recurso", 1),
 ("Página de reservas y código QR", "El cliente reserva solo", 1),
 ("Pedidos por QR y Atención en sitio", "Carta del día y tablero en vivo", 1),
 ("Planes y paquetes", "Bonos, membresías y tarjetas de sellos", 1),
 ("Ventas", "La caja del día por medio de pago", 1),
 ("Opiniones y Recuperar clientes", "Encuestas y clientes que no vuelven", 1),
 ("Configuración avanzada y reportes", "Nequi, avisos, Google Calendar y CSV", 1),
 ("Cómo se conecta Telegram", "Paso a paso, canal activo hoy", 0),
 ("WhatsApp Business con YCloud", "Paso a paso, con tu mismo número", 1),
 ("Seguridad y privacidad", "Aislamiento de datos por negocio", 0),
 ("Planes y precios sugeridos", "Comparables de mercado", 0),
 ("Preguntas frecuentes", "Dudas típicas de un dueño de negocio", 0),
 ("Referencias", "Fuentes citadas en normas APA", 0),
]
NEW = ' <span class="new">Nuevo</span>'
items = "\n".join(
    f'<div class="row"><b>{i:02d}</b><span class="t">{t}{NEW if n else ""}</span><span class="d">{d}</span></div>'
    for i, (t, d, n) in enumerate(rows, 1))
head = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Índice</title>
<!-- Índice del manual (v3). Lo genera build_index.py; build_manual.py reemplaza la página 2 del original por esta. -->
<link rel="stylesheet" href="manual.css" />
<style>
  @page { margin: 38pt 42pt 30pt 42pt; }
  .chip { margin-top: 4pt; }
  .big { font-size: 25pt; font-weight: 800; margin: 2pt 0 6pt; letter-spacing: -0.4pt; }
  .sub { color: var(--muted); font-size: 12pt; margin: 0 0 8pt; }
  .row { display: flex; align-items: baseline; border-bottom: 1pt dashed #e0d3bd; padding: 3.9pt 0 3.7pt; line-height: 1.2; }
  .row b { color: var(--accent); font-size: 11.5pt; font-weight: 800; width: 34pt; }
  .row .t { font-size: 11.5pt; flex: 1; text-align: left; }
  .row .d { font-size: 9.5pt; color: var(--muted); text-align: right; }
  .new { display: inline-block; background: #f0ded3; color: var(--accent); font-size: 7pt; font-weight: 700; border-radius: 9pt; padding: 0.5pt 6pt; margin-left: 6pt; vertical-align: 1.5pt; }
</style>
</head>
<body>
<span class="chip">Contenido</span>
<div class="big">Índice</div>
<p class="sub">Guía completa de funcionalidades, rubros, integración de canales y planes comerciales.</p>
"""
open("indice.html", "w").write(head + items + "\n</body>\n</html>\n")
