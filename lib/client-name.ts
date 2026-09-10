const inappropriateNameTerms = new Set([
  "arrombado", "arrombada", "babaca", "baitola", "bicha", "boiola", "bosta", "boceta",
  "boquete", "brocha", "broxa", "buceta", "bunda", "bundao", "cacete", "caralho",
  "corno", "corna", "cu", "desgracado", "desgracada", "fdp", "foda", "fodase", "foder",
  "gostosa", "gostoso", "gozada", "gozar", "imbecil", "idiota", "mamada", "masturbacao",
  "merda", "pau", "penis", "pica", "piroca", "porra", "pqp", "punheta", "puta", "putaria",
  "puto", "rabao", "rola", "safada", "safado", "sexo", "siririca", "tesao", "transar",
  "vagabunda", "vagabundo", "vagina", "viado", "vsf", "xereca", "xota", "xoxota",
]);

const normalizeForValidation = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR");

const collapseRepeatedLetters = (value: string) => value.replace(/([a-z])\1+/g, "$1");

function containsInappropriateName(words: string[]) {
  if (words.some((word) => inappropriateNameTerms.has(word) || inappropriateNameTerms.has(collapseRepeatedLetters(word)))) return true;

  // Também bloqueia tentativas de separar a palavra com espaços, pontos ou hífens: p.i.c.a, p i c a etc.
  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    for (let end = start; end < Math.min(words.length, start + 8); end += 1) {
      joined += words[end];
      if (end > start && joined.length >= 4 && (
        inappropriateNameTerms.has(joined) || inappropriateNameTerms.has(collapseRepeatedLetters(joined))
      )) return true;
      if (joined.length > 18) break;
    }
  }
  return false;
}

export function validClientName(value: string, maximumLength = 100) {
  const name = value.trim().replace(/\s+/g, " ").slice(0, maximumLength);
  if (name.length < 2) throw new Error("Informe o nome do cliente.");
  if (!/^[\p{L}\p{M}\s.'’-]+$/u.test(name) || (name.match(/\p{L}/gu)?.length ?? 0) < 2) {
    throw new Error("Informe um nome válido, usando somente letras.");
  }
  const words = normalizeForValidation(name).split(/[^a-z]+/).filter(Boolean);
  if (containsInappropriateName(words)) {
    throw new Error("Informe um nome válido, sem palavras impróprias ou ofensivas.");
  }
  return name;
}
