import { NextResponse } from "next/server";
import { ACCESS_COOKIE, accessCode, hashAccessCode } from "../../../lib/access.js";

export async function POST(request) {
  const configured = accessCode();
  if (!configured) {
    return NextResponse.json({ error: "Proteção de acesso ainda não configurada." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Informe o código de acesso." }, { status: 400 });
  }

  const provided = String(body?.code || "").trim();
  const [providedHash, expectedHash] = await Promise.all([
    hashAccessCode(provided),
    hashAccessCode(configured),
  ]);

  if (!provided || providedHash !== expectedHash) {
    return NextResponse.json({ error: "Código de acesso incorreto." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_COOKIE,
    value: expectedHash,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: ACCESS_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}
