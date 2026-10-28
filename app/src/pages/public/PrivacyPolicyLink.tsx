/** Enlace a la Política de privacidad que se abre aparte, sin perder lo que el cliente ya llenó. */
export function PrivacyPolicyLink() {
  return (
    <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
      Política de privacidad
    </a>
  );
}
