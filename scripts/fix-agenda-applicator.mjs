import fs from 'node:fs';
const path = 'scripts/apply-agenda-ca-upgrade.mjs';
const source = fs.readFileSync(path, 'utf8');
const before = 'document.getElementById(`appointment-${id}`)?.scrollIntoView';
const after = 'document.getElementById("appointment-" + id)?.scrollIntoView';
if (!source.includes(before)) throw new Error('Trecho do aplicador não encontrado.');
fs.writeFileSync(path, source.replace(before, after));
