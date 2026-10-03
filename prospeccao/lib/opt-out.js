export function isClearOptOut(value) {
  const text = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return /^(nao (quero|tenho interesse)|sem interesse)(\s+(obrigad[oa]|valeu))?$/.test(text) || /\b(retire|remova|tire|exclua) (meu|o meu) (numero|contato)\b/.test(text) || /\b(pare|para) de (me mandar|enviar) (mensage(ns|m)|propaganda)\b/.test(text);
}
