import { execFileSync } from "node:child_process";

const VALID_DDDS = new Set([
  "11","12","13","14","15","16","17","18","19","21","22","24","27","28","31","32","33","34","35","37","38",
  "41","42","43","44","45","46","47","48","49","51","53","54","55","61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79","81","82","83","84","85","86","87","88","89","91","92","93","94","95","96","97","98","99",
]);

function runOvertureSearch() {
  const raw = execFileSync(
    "python3",
    ["scripts/overture-search.py", "-46.83", "-24.01", "-46.36", "-23.35", "180"],
    {
      encoding: "utf8",
      timeout: 90000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    },
  );
  return JSON.parse(raw);
}

function isBrazilMobile(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0055") && digits.length === 15) digits = digits.slice(4);
  if (digits.startsWith("55") && digits.length === 13) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 12) digits = digits.slice(1);
  return digits.length === 11 && VALID_DDDS.has(digits.slice(0, 2)) && digits[2] === "9";
}

const result = runOvertureSearch();
const places = Array.isArray(result?.places) ? result.places : [];
if (places.length < 5) throw new Error(`Overture retornou poucos barbeiros em São Paulo: ${places.length}.`);

const withPhone = places.filter((place) => Array.isArray(place?.phones) && place.phones.length > 0);
if (withPhone.length < 1) throw new Error(`Overture encontrou ${places.length} barbeiros em São Paulo, mas nenhum telefone.`);

const withMobile = places.filter((place) => Array.isArray(place?.phones) && place.phones.some(isBrazilMobile));
if (withMobile.length < 5) throw new Error(`Overture encontrou telefones, mas apenas ${withMobile.length} celulares brasileiros válidos em São Paulo.`);

const sample = withMobile.slice(0, 3).map((place) => `${place.name}: ${place.phones.find(isBrazilMobile)}`).join(" | ");
console.log(`Overture real OK: ${places.length} barbeiros, ${withPhone.length} com telefone, ${withMobile.length} com celular válido. Amostra móvel: ${sample}`);
