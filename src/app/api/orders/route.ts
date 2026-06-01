import { NextResponse } from "next/server";
import { createOrderWithFile, openDatabase } from "@/backend/database";
import { notifyAdminNewOrder } from "@/backend/email";
import { consumeUploadRateLimit, getClientIp } from "@/backend/rateLimit";
import { saveUploadFile } from "@/backend/uploads";

export const runtime = "nodejs";

const requiredFields = ["customerName", "phone", "wechat", "material"] as const;

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

    const file = formData.get("modelFile");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "请上传模型文件" }, { status: 400 });
    }

    const savedFile = await saveUploadFile(file);
    const db = openDatabase();

    try {
      const quantity = Math.max(Number(getString(formData, "quantity") || 1), 1);
      const orderInput = {
        customerName: getString(formData, "customerName"),
        phone: getString(formData, "phone"),
        wechat: getString(formData, "wechat"),
        email: getString(formData, "email"),
        company: getString(formData, "company"),
        material: getString(formData, "material"),
        color: getString(formData, "color"),
        quantity,
        remark: getString(formData, "remark"),
        estimatedPrice: estimatePrice(getString(formData, "material"), quantity),
        file: savedFile,
      };
      const order = createOrderWithFile(db, orderInput);

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

function estimatePrice(material: string, quantity: number) {
  const base = material === "ABS" ? 30 : material === "PETG" ? 25 : 20;
  return Math.max(base * quantity + 10, 20);
}
