import { Link } from "react-router-dom";
import { LEGAL_CONTACT_EMAIL, LegalLayout } from "./LegalLayout";

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Política de privacidad">
      <p>
        ReservasIA es una plataforma para que negocios (restaurantes, barberías, salones, consultorios, talleres y otros) gestionen
        reservas, pedidos y la atención de sus clientes con un agente de inteligencia artificial. Esta política explica qué datos
        tratamos, para qué y cuáles son tus derechos, de acuerdo con la Ley 1581 de 2012 de Colombia y sus normas reglamentarias.
      </p>

      <h2>1. Responsable y encargado</h2>
      <ul>
        <li>
          <strong>Datos de los negocios que usan ReservasIA</strong> (cuentas, usuarios del equipo, configuración): ReservasIA es el
          responsable del tratamiento.
        </li>
        <li>
          <strong>Datos de los clientes de cada negocio</strong> (quienes reservan, piden o escriben al negocio): el negocio es el
          responsable y ReservasIA actúa como encargado, tratándolos solo para prestarle el servicio al negocio y según sus
          instrucciones.
        </li>
      </ul>
      <p>
        Contacto para temas de privacidad: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">{LEGAL_CONTACT_EMAIL}</a>.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Cuenta del negocio:</strong> nombre, correo electrónico y contraseña (la gestiona el sistema de autenticación y nunca se guarda en texto plano), datos del negocio (nombre,
          dirección, teléfono, horarios, servicios, precios) y del equipo.
        </li>
        <li>
          <strong>Clientes del negocio:</strong> nombre, teléfono o identificador de chat (WhatsApp o Telegram), correo si lo
          entregan, reservas, pedidos, pagos registrados, notas y la información que pidan los formularios del negocio (por ejemplo,
          datos del vehículo o de la mascota).
        </li>
        <li>
          <strong>Datos sensibles:</strong> en negocios de salud o bienestar puede tratarse información de salud. Solo se guarda con
          la autorización expresa del cliente, que el agente solicita antes de registrarla.
        </li>
        <li>
          <strong>Conversaciones:</strong> los mensajes que los clientes intercambian con el negocio y con su agente por WhatsApp,
          Telegram o la página pública del negocio.
        </li>
        <li>
          <strong>Integraciones:</strong> las credenciales que el negocio conecta (Google Calendar, YCloud, Twilio, Telegram), que se
          guardan protegidas y solo las usa el servidor; el panel del negocio no las muestra.
        </li>
        <li>
          <strong>Datos técnicos:</strong> registros de uso y de errores necesarios para operar y proteger el servicio.
        </li>
      </ul>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Crear, confirmar, cambiar y cancelar reservas y pedidos, y mostrarlos en el panel del negocio.</li>
        <li>Responder a los clientes por medio del agente de IA y avisarles cuando su pedido está listo o su cita se acerca.</li>
        <li>Generar reportes para el negocio, encuestas de satisfacción y campañas que el propio negocio active.</li>
        <li>Dar soporte, prevenir fraude y abuso, y cumplir obligaciones legales.</li>
      </ul>
      <p>No vendemos datos personales ni los usamos para publicidad.</p>

      <h2>4. Google Calendar</h2>
      <p>
        Si el negocio conecta su Google Calendar, ReservasIA solicita acceso para administrar eventos (
        <code className="text-xs">calendar.events</code>) y para conocer el correo de la cuenta conectada. Con ese acceso solo crea,
        actualiza y elimina en el calendario principal los eventos que corresponden a las reservas hechas en ReservasIA, y puede enviar
        la invitación al correo del cliente si este lo entregó. No lee ni modifica otros eventos del calendario.
      </p>
      <p>
        El uso y la transferencia de la información recibida de las API de Google se ajusta a la{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Política de datos de usuario de los servicios de API de Google
        </a>
        , incluidos los requisitos de uso limitado. Esos datos no se usan para publicidad, no se venden, no se transfieren a terceros
        salvo para prestar esta función, y no se usan para entrenar modelos de inteligencia artificial. El negocio puede desconectar
        Google Calendar en cualquier momento desde Integraciones, y también puede retirar el acceso desde su cuenta de Google.
      </p>

      <h2>5. Con quién se comparten</h2>
      <p>Usamos proveedores que tratan datos por cuenta nuestra, solo para prestar el servicio:</p>
      <ul>
        <li>Alojamiento y base de datos: InsForge, Railway y Vercel.</li>
        <li>Mensajería: Meta (WhatsApp) a través de YCloud o Twilio, y Telegram, según lo que conecte el negocio.</li>
        <li>
          Inteligencia artificial: proveedores de modelos de lenguaje (como OpenAI o Google Gemini) procesan los mensajes para generar
          las respuestas del agente.
        </li>
        <li>Google, cuando el negocio conecta Google Calendar.</li>
      </ul>
      <p>
        Algunos de estos proveedores están fuera de Colombia, por lo que puede haber transferencia internacional de datos con las
        garantías que exige la ley. También compartiremos datos si una autoridad competente lo exige legalmente.
      </p>

      <h2>6. Conservación y seguridad</h2>
      <p>
        Conservamos los datos mientras la cuenta del negocio esté activa o mientras sean necesarios para las finalidades descritas y
        para cumplir obligaciones legales. Los mensajes de las conversaciones con el agente se borran automáticamente al año. Cuando
        un negocio elimina a un cliente, se borran también sus conversaciones y sus datos en las reservas, que quedan en la agenda
        sin nombre ni notas. Aplicamos medidas como cifrado en tránsito, control de acceso por negocio y credenciales protegidas.
        Ningún sistema es completamente infalible, pero trabajamos para proteger la información.
      </p>

      <h2>7. Tus derechos</h2>
      <p>Como titular de los datos podés:</p>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos personales.</li>
        <li>Pedir prueba de la autorización otorgada y revocarla, o pedir que se eliminen tus datos cuando proceda.</li>
        <li>Saber qué uso se les ha dado.</li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
      </ul>
      <p>
        Si sos cliente de un negocio, podés pedírselo directamente al negocio o escribirnos a{" "}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-primary hover:underline">{LEGAL_CONTACT_EMAIL}</a> y lo
        gestionamos con él. Respondemos consultas en un máximo de 10 días hábiles y reclamos en un máximo de 15 días hábiles.
      </p>

      <h2>8. Menores de edad</h2>
      <p>
        ReservasIA está dirigida a negocios. Los datos de menores solo se tratan cuando el negocio los necesita para prestar su
        servicio (por ejemplo, una clase o una consulta) y con la autorización de su representante legal.
      </p>

      <h2>9. Cambios</h2>
      <p>
        Podemos actualizar esta política. Publicaremos la nueva versión en esta página con su fecha, y si el cambio es importante lo
        avisaremos dentro de la aplicación. Consultá también las <Link to="/terminos" className="text-primary hover:underline">Condiciones del servicio</Link>.
      </p>
    </LegalLayout>
  );
}
