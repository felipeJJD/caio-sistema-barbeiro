import { generateVapidKeys } from "@mmmike/web-push/vapid";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { dataDirectory } from "./storage.mjs";

const runtimeVapidKey = Symbol.for("cortou-anotou.vapid-config");
const defaultSubject = "https://cortouanotou.com.br";

function validSubject(value) {
  return /^(mailto:|https:\/\/)/.test(value);
}

function validKeys(value) {
  if (!value || typeof value !== "object") return false;
  try {
    const publicBytes = Buffer.from(String(value.publicKey ?? ""), "base64url");
    const privateBytes = Buffer.from(String(value.privateKey ?? ""), "base64url");
    return publicBytes.length === 65 && publicBytes[0] === 0x04 && privateBytes.length === 32;
  } catch {
    return false;
  }
}

function subjectFromEnvironment(environment) {
  const configured = String(environment.VAPID_SUBJECT ?? "").trim();
  if (validSubject(configured)) return configured;
  const appUrl = String(environment.PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return validSubject(appUrl) ? appUrl : defaultSubject;
}

function environmentConfig(environment) {
  const config = {
    publicKey: String(environment.VAPID_PUBLIC_KEY ?? "").trim(),
    privateKey: String(environment.VAPID_PRIVATE_KEY ?? "").trim(),
    subject: subjectFromEnvironment(environment),
  };
  return validKeys(config) ? config : null;
}

export async function loadVapidConfig({ environment = process.env, directory = dataDirectory() } = {}) {
  const configured = environmentConfig(environment);
  if (configured) return configured;

  const secretsDirectory = join(directory, "secrets");
  const filename = join(secretsDirectory, "vapid.json");
  await mkdir(secretsDirectory, { recursive: true, mode: 0o700 });

  try {
    const stored = JSON.parse(await readFile(filename, "utf8"));
    if (!validKeys(stored)) throw new Error("A configuração persistida de notificações é inválida.");
    return { publicKey: stored.publicKey, privateKey: stored.privateKey, subject: subjectFromEnvironment(environment) };
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }

  const generated = await generateVapidKeys();
  const persisted = { version: 1, ...generated };
  const temporaryFilename = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryFilename, `${JSON.stringify(persisted)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await link(temporaryFilename, filename);
    return { ...generated, subject: subjectFromEnvironment(environment) };
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
    const stored = JSON.parse(await readFile(filename, "utf8"));
    if (!validKeys(stored)) throw new Error("A configuração persistida de notificações é inválida.");
    return { publicKey: stored.publicKey, privateKey: stored.privateKey, subject: subjectFromEnvironment(environment) };
  } finally {
    await unlink(temporaryFilename).catch(() => undefined);
  }
}

export function getRuntimeVapidConfig() {
  if (!globalThis[runtimeVapidKey]) globalThis[runtimeVapidKey] = loadVapidConfig();
  return globalThis[runtimeVapidKey];
}
