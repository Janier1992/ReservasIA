import { Link } from "react-router-dom";
import { LEGAL_CONTACT_EMAIL, LegalLayout } from "./LegalLayout";

export function TermsPage() {
  return (
    <LegalLayout title="Condiciones del servicio">
      <p>
        Estas condiciones regulan el uso de ReservasIA. Al crear una cuenta o usar la plataforma, el negocio que se registra y las
        personas de su equipo las aceptan.
      </p>

      <h2>1. El servicio</h2>
      <p>
        ReservasIA permite a los negocios recibir y gestionar reservas, pedidos y turnos; atender a sus clientes con un agente de
        inteligencia artificial por WhatsApp, Telegram o una página pública; y llevar clientes, caja, planes, encuestas y reportes. Las
        funciones disponibles dependen del tipo de negocio y del plan.
      </p>

      <h2>2. Cuentas</h2>
      <ul>
        <li>Quien crea la cuenta declara que puede representar al negocio y que los datos que entrega son verdaderos.</li>
        <li>El negocio es responsable de las personas que invita a su equipo y de mantener sus contraseñas en reserva.</li>
        <li>Si detectás un uso no autorizado de tu cuenta, avisanos de inmediato.</li>
      </ul>

      <h2>3. Prueba gratis, planes y pagos</h2>
      <p>
        Las cuentas nuevas tienen un periodo de prueba gratis. Al terminar, para seguir usando el servicio hay que pagar la suscripción
        del plan elegido. Si la suscripción vence sin pago, la cuenta puede suspenderse hasta que se regularice; los datos se conservan
        según la <Link to="/privacidad" className="text-primary hover:underline">Política de privacidad</Link>. Los costos de terceros
        que el negocio contrate por su cuenta (por ejemplo, los mensajes de WhatsApp cobrados por Meta a través de YCloud) no
        están incluidos en la suscripción.
      </p>

      <h2>4. Responsabilidades del negocio</h2>
      <ul>
        <li>
          Es responsable de los datos de sus clientes: debe informarles y obtener las autorizaciones que exige la ley (en especial
          para datos sensibles como los de salud) y atender sus solicitudes.
        </li>
        <li>
          Debe cumplir las políticas de los canales que conecta, incluidas las de WhatsApp Business y Meta: no enviar spam, escribir
          con fines promocionales solo a quienes lo aceptaron y respetar a quien pida no recibir más mensajes.
        </li>
        <li>Es responsable de los precios, horarios, servicios y demás información que configura, y de lo que ofrece a sus clientes.</li>
        <li>No puede usar ReservasIA para actividades ilegales, engañosas o que infrinjan derechos de terceros.</li>
      </ul>

      <h2>5. El agente de inteligencia artificial</h2>
      <p>
        El agente responde con base en la información que el negocio configura y puede equivocarse. No da diagnósticos médicos,
        legales ni de otro tipo profesional, y ante una emergencia indica buscar atención inmediata. El negocio debe revisar la
        configuración del agente y puede pausarlo o responder él mismo en cualquier momento.
      </p>

      <h2>6. Integraciones de terceros</h2>
      <p>
        Google Calendar, WhatsApp (por YCloud), Telegram y otros servicios conectados se rigen además por sus propias
        condiciones. ReservasIA no controla su disponibilidad y no responde por fallas, bloqueos o cambios de esos servicios.
      </p>

      <h2>7. Disponibilidad</h2>
      <p>
        Trabajamos para que el servicio esté disponible y funcione bien, pero puede haber interrupciones por mantenimiento, fallas de
        proveedores o causas ajenas a nuestro control. Podemos mejorar, cambiar o retirar funciones, avisando con anticipación cuando
        el cambio sea relevante.
      </p>

      <h2>8. Propiedad</h2>
      <p>
        El software, la marca y los contenidos de ReservasIA nos pertenecen. Los datos que carga el negocio siguen siendo suyos; nos
        da permiso para tratarlos solo para prestarle el servicio.
      </p>

      <h2>9. Limitación de responsabilidad</h2>
      <p>
        En la medida que lo permita la ley, ReservasIA no responde por daños indirectos, lucro cesante ni pérdida de oportunidades, y
        su responsabilidad total se limita al valor pagado por el negocio en los tres meses anteriores al hecho que la origine.
      </p>

      <h2>10. Terminación</h2>
      <p>
        El negocio puede dejar de usar el servicio cuando quiera. Podemos suspender o cerrar una cuenta que incumpla estas condiciones,
        en especial ante spam, fraude o uso ilegal.
      </p>

      <h2>11. Ley aplicable y contacto</h2>
      <p>
        Estas condiciones se rigen por las leyes de la República de Colombia. Podemos actualizarlas publicando la nueva versión en esta
        página. Para cualquier consulta, escribinos a{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">{LEGAL_CONTACT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
