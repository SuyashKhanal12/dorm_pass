import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({
      user: {
        name: session.name,
        entry: session.entry,
        isAdmin: session.isAdmin,
        adminScope: session.adminScope,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
