import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { NextResponse } from "next/server";
import { getOrderById, openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { getPrusaSlicerConfig } from "@/backend/slicer";

export const runtime = "nodejs";

type SliceTestResponse = {
  success: boolean;
  message: string;
  job?: Record<string, unknown>;
  error?: string;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return jsonResponse(
      {
        success: false,
        message: "未登录",
        error: "unauthorized",
      },
      401,
    );
  }

  const slicerConfig = getPrusaSlicerConfig();

  if (!slicerConfig.enabled) {
    return jsonResponse(
      {
        success: false,
        message: "自动切片报价尚未启用",
        error: "PrusaSlicer disabled",
      },
      400,
    );
  }

  if (!(await fileExists(slicerConfig.profilePath))) {
    return jsonResponse(
      {
        success: false,
        message: "切片配置缺失，请先配置 profiles/bambu-p1s.ini",
        error: `Profile not found: ${slicerConfig.profilePath}`,
      },
      400,
    );
  }

  const { id } = await params;
  const db = openDatabase();

  try {
    const order = getOrderById(db, Number(id));
    const firstFile = order.files[0];

    if (!firstFile) {
      return jsonResponse(
        {
          success: false,
          message: "切片失败：订单没有可切片文件",
          error: "No files found",
        },
        400,
      );
    }

    return jsonResponse({
      success: true,
      message: "切片成功",
      job: {
        orderId: order.id,
        fileId: firstFile.id,
        status: "queued",
        inputFilePath: firstFile.filepath,
        material: firstFile.material || order.material,
        profilePath: slicerConfig.profilePath,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";

    return jsonResponse(
      {
        success: false,
        message: `切片失败：${message}`,
        error: message,
      },
      400,
    );
  } finally {
    db.close();
  }
}

function jsonResponse(body: SliceTestResponse, status = 200) {
  return NextResponse.json(body, { status });
}

async function fileExists(path: string) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
