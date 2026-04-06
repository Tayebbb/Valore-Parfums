import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// GET /api/auth/me — returns current user from session cookie
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json(null);
    return NextResponse.json(user);
  } catch (error) {
    console.error("auth/me failed", error);
    return NextResponse.json(null);
  }
}
