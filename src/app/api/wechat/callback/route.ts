import { NextResponse } from "next/server";
import { openDatabase } from "@/backend/database";
import {
  getWechatMpConfig,
  handleWechatMessage,
  hasWechatCallbackConfig,
  isWechatMpEnabled,
  verifyWechatSignature,
} from "@/backend/wechat";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const config = getWechatMpConfig();

  if (!hasWechatCallbackConfig()) {
    return new Response("wechat token is not configured", { status: 400 });
  }

  const verified = verifyWechatSignature(
    config.token,
    searchParams.get("timestamp"),
    searchParams.get("nonce"),
    searchParams.get("signature"),
  );

  if (!verified) {
    return new Response("invalid signature", { status: 403 });
  }

  return new Response(searchParams.get("echostr") || "", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const config = getWechatMpConfig();

  if (!hasWechatCallbackConfig()) {
    return new Response("success");
  }

  const verified = verifyWechatSignature(
    config.token,
    searchParams.get("timestamp"),
    searchParams.get("nonce"),
    searchParams.get("signature"),
  );

  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  if (!isWechatMpEnabled()) {
    return new Response("success");
  }

  const xml = await request.text();
  const db = openDatabase();

  try {
    const reply = await handleWechatMessage(db, xml);
    return new Response(reply, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } finally {
    db.close();
  }
}
