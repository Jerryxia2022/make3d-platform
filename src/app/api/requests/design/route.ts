import { NextResponse } from "next/server";
import {
  getCustomerFromRequestCookie,
  logCustomerSessionDiagnostics,
} from "@/backend/accountAuth";
import {
  createServiceRequest,
  getCustomerById,
  openDatabase,
} from "@/backend/database";
import { saveRequestAttachmentFile } from "@/backend/uploads";
import { isValidMainlandPhone, mainlandPhoneErrorMessage } from "@/shared/phoneValidation";

export const runtime = "nodejs";

const MAX_ATTACHMENT_COUNT = 8;

export async function POST(request: Request) {
  const session = getCustomerFromRequestCookie(request);

  if (!session) {
    logCustomerSessionDiagnostics("[make3d] /api/requests/design customer session failed", request);
    return NextResponse.json({ error: "请先登录后提交需求" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const projectName = getString(formData, "projectName");
    const modificationNotes = getString(formData, "modificationNotes");
    const budgetRange = getString(formData, "budgetRange");
    const contactPhone = getString(formData, "contactPhone");

    if (!projectName || !modificationNotes || !budgetRange || !contactPhone) {
      return NextResponse.json({ error: "请填写项目名称、修改说明、预算范围和联系方式" }, { status: 400 });
    }

    if (!isValidMainlandPhone(contactPhone)) {
      return NextResponse.json({ error: mainlandPhoneErrorMessage }, { status: 400 });
    }

    const attachments = getAttachmentFiles(formData);

    if (attachments.length > MAX_ATTACHMENT_COUNT) {
      return NextResponse.json({ error: "一次最多上传 8 个附件" }, { status: 400 });
    }

    const savedFiles = await Promise.all(attachments.map((file) => saveRequestAttachmentFile(file)));
    const db = openDatabase();

    try {
      const customer = getCustomerById(db, session.customerId);

      if (!customer) {
        return NextResponse.json({ error: "请先登录后提交需求" }, { status: 401 });
      }

      const created = createServiceRequest(db, {
        requestType: "design",
        customerId: customer.id,
        projectName,
        customerName: getString(formData, "contactName") || customer.name,
        phone: contactPhone,
        wechat: getString(formData, "contactWechat") || customer.wechat,
        email: getString(formData, "contactEmail") || customer.email,
        budgetRange,
        expectedDeliveryTime: getString(formData, "expectedDeliveryTime"),
        modificationNotes,
        keyDimensions: getString(formData, "keyDimensions"),
        needsPrinting: getString(formData, "needsPrinting"),
        remarks: getString(formData, "remarks"),
        files: savedFiles,
      });

      return NextResponse.json(created, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "需求提交失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getAttachmentFiles(formData: FormData) {
  return formData
    .getAll("attachments")
    .filter((file): file is File => file instanceof File && file.size > 0);
}
