import { NextResponse } from "next/server";
import { createOrderWithFiles, openDatabase } from "@/backend/database";
import { notifyAdminNewOrder } from "@/backend/email";
import { consumeUploadRateLimit, getClientIp } from "@/backend/rateLimit";
import { saveUploadFile } from "@/backend/uploads";

export const runtime = "nodejs";

const MAX_FILE_COUNT = 5;
const requiredFields = ["customerName", "phone", "wechat"] as const;

export async function POST(request: Request) {
  try {
    const rateLimit = consumeUploadRateLimit(getClientIp(request));

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "上传过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 600),
          },
        },
      );
    }

    const formData = await request.formData();
    const missingField = requiredFields.find((field) => !getString(formData, field));

    if (missingField) {
      return NextResponse.json(
        { error: `缺少必填字段：${missingField}` },
        { status: 400 },
      );
    }

    const rawFiles = formData.getAll("modelFiles");
    const uploadedFiles = rawFiles.filter(
      (file): file is File => file instanceof File && file.size > 0,
    );

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: "请上传模型文件" }, { status: 400 });
    }

    if (uploadedFiles.length > MAX_FILE_COUNT) {
      return NextResponse.json({ error: "一次最多上传 5 个模型文件" }, { status: 400 });
    }

    const rawMaterials = formData.getAll("fileMaterials");
    const rawColors = formData.getAll("fileColors");
    const materials = rawMaterials
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    const colors = rawColors
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    const savedFiles = await Promise.all(
      uploadedFiles.map(async (file, index) => ({
        ...(await saveUploadFile(file)),
        material: materials[index] || "PLA",
        color: colors[index] || "黑",
      })),
    );
    const firstFile = savedFiles[0];
    const db = openDatabase();

    try {
      const orderInput = {
        customerName: getString(formData, "customerName"),
        phone: getString(formData, "phone"),
        wechat: getString(formData, "wechat"),
        email: getString(formData, "email"),
        company: "",
        material: firstFile.material,
        color: firstFile.color,
        quantity: savedFiles.length,
        remark: getString(formData, "remark"),
        estimatedPrice: 0,
        files: savedFiles,
      };
      const order = createOrderWithFiles(db, orderInput);

      await notifyAdminNewOrder({
        ...order,
        ...orderInput,
      });

      return NextResponse.json(order, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
