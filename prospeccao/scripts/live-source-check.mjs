import { execFileSync } from "node:child_process";

function runOvertureSearch() {
  const raw = execFileSync(
    "python3",
    [
      "scripts/overture-search.py",
      "-46.83",
      "-24.01",
      "-46.36",
      "-23.35",
      "180",
    ],
    {
      encoding: "utf8",
      timeout: 90000,
      maxBuffer: 8 * 1024 * 1024,
      env: process.env,
    },
  );
  return JSON.parse(raw);
}

const result = runOvertureSearch();
const places = Array.isArray(result?.places) ? result.places : [];
if (places.length < 5) {
  throw new Error(`Overture retornou poucos barbeiros em São Paulo: ${places.length}.`);
}

const withPhone = places.filter((place) => Array.isArray(place?.phones) && place.phones.length > 0);
if (withPhone.length < 1) {
  throw new Error(`Overture encontrou ${places.length} barbeiros em São Paulo, mas nenhum telefone.`);
}

const sample = withPhone.slice(0, 3).map((place) => `${place.name}: ${place.phones[0]}`).join(" | ");
console.log(`Overture real OK: ${places.length} barbeiros, ${withPhone.length} com telefone. Amostra: ${sample}`);
