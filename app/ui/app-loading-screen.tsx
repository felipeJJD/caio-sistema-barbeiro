export function AppLoadingScreen({ intro = false }: { intro?: boolean }) {
  return (
    <div
      className={"app-loading-screen" + (intro ? " app-loading-intro" : "")}
      role="status"
      aria-live="polite"
      aria-label="Carregando o Cortou Anotou"
    >
      <div className="app-loading-content">
        <div className="app-loading-ca" aria-hidden="true">
          <b>C</b>
          <i />
          <b>A</b>
        </div>
        <p className="app-loading-name">CORTOU <strong>ANOTOU</strong></p>
        <small>AGENDA E GESTÃO PARA BARBEARIAS</small>
        <div className="app-loading-track" aria-hidden="true"><i /></div>
        <p className="app-loading-copy">Carregando...</p>
      </div>
      <div className="app-loading-signature">
        <span>CORTOU ANOTOU · VERSÃO 1.0</span>
        <strong>BY KAIO</strong>
      </div>
    </div>
  );
}
