import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { NextResponse } from "next/server";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { getQuoteDraftFileForCustomer, openDatabase } from "@/backend/database";
import { validateDerivedStlArtifact } from "@/backend/modelConversion";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = openDatabase();

  try {
    const file = getQuoteDraftFileForCustomer(db, session.customerId, Number(id));
    const wantsPreview = new URL(request.url).searchParams.get("artifact") === "preview";
    const artifact = wantsPreview && file.derivedStlFilepath
      ? await validateDerivedStlArtifact({
          filepath: file.derivedStlFilepath,
          filesize: file.derivedStlFilesize,
          sha256: file.derivedStlSha256,
        })
      : null;
    const filepath = artifact?.filepath || file.filepath;
    const downloadName = artifact?.filename || file.originalFilename || file.filename;
    const content = await readFile(filepath);

    return new NextResponse(content, {
      headers: {
        "Content-Disposition": `inline; filename="${basename(downloadName)}"`,
        "Content-Type": artifact ? "model/stl" : "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在或草稿已过期" }, { status: 404 });
  } finally {
    db.close();
  }
}
