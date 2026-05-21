import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Delete the cookie by setting it with maxAge: 0 on the response directly.
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
