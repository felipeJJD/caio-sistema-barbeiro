type BrandLogoProps = {
  variant?: "sidebar" | "access";
};

export function BrandLogo({ variant = "sidebar" }: BrandLogoProps) {
  return (
    <div className={`brand-logo ${variant === "access" ? "brand-logo-access" : ""}`} aria-label="Cortou Anotou">
      <span className="brand-symbol" aria-hidden="true"><span className="brand-letter-c">C</span><i className="brand-divider" /><span className="brand-letter-a">A</span></span>
      <span className="brand-wordmark"><span className="brand-name">CORTOU <span>ANOTOU</span></span><span className="brand-tagline">AGENDA E GESTÃO PARA BARBEARIAS</span></span>
    </div>
  );
}
