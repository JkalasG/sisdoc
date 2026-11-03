/** Logo de Iris. Alterna la versión clara/oscura según el tema (selector `[data-theme="dark"]`). */
export function BrandLogo({ className = 'h-10', mark = false }: { className?: string; mark?: boolean }) {
  const light = mark ? '/images/avion-sin-estela.svg' : '/images/logo-iris.svg';
  const dark = mark ? '/images/avion-sin-estela.svg' : '/images/logo-iris-blanco.svg';
  return (
    <>
      <img src={light} alt="Iris" className={`w-auto dark:hidden ${className}`} />
      <img src={dark} alt="" aria-hidden="true" className={`hidden w-auto dark:block ${className}`} />
    </>
  );
}
