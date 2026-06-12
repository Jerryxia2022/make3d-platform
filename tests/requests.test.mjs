import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  SERVICE_REQUEST_STATUSES,
  createCustomerAccount,
  createServiceRequest,
  getServiceRequestById,
  getServiceRequestFileById,
  getServiceRequestLogsByRequestId,
  initDatabase,
  listServiceRequestsByCustomerId,
  searchServiceRequests,
  updateServiceRequestStatus,
} from "../src/backend/database.ts";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("creates, lists, and updates non-standard service requests", () => {
  const db = initDatabase(":memory:");
  const customer = createCustomerAccount(db, {
    phone: "13800000000",
    password: "password123",
    name: "Jerry",
    wechat: "make3d",
    email: "jerry@example.com",
  });

  assert.deepEqual(SERVICE_REQUEST_STATUSES, ["待评估", "已联系", "已报价", "已接受", "已拒绝", "已完成"]);

  const created = createServiceRequest(db, {
    requestType: "development",
    customerId: customer.id,
    projectName: "桌面工装夹具",
    customerName: "Jerry",
    phone: "13800000000",
    wechat: "make3d",
    email: "jerry@example.com",
    budgetRange: "2000-10000元",
    expectedDeliveryTime: "两周内",
    projectType: "工装夹具",
    functionDescription: "用于固定小型结构件并重复定位",
    hasDrawingsOrSample: "已有样品",
    needsOnsiteMeasurement: "可能需要",
    acceptsEveningOrWeekendContact: "接受",
    remarks: "先评估方案",
    files: [
      {
        filename: "fixture.step",
        filepath: "/uploads/fixture.step",
        filesize: 1024,
      },
    ],
  });

  const detail = getServiceRequestById(db, created.id);
  assert.equal(detail.projectName, "桌面工装夹具");
  assert.equal(detail.status, "待评估");
  assert.equal(detail.files.length, 1);
  assert.equal(detail.fileCount, 1);
  assert.equal(listServiceRequestsByCustomerId(db, customer.id).length, 1);
  assert.equal(searchServiceRequests(db, { query: "工装", requestType: "development" }).length, 1);
  assert.equal(getServiceRequestFileById(db, detail.files[0].id).filename, "fixture.step");

  assert.equal(
    updateServiceRequestStatus(db, created.id, {
      status: "已联系",
      adminNote: "客户晚上方便沟通",
      contactNote: "已电话沟通，补充夹具尺寸",
      operator: "admin",
    }),
    true,
  );

  const updated = getServiceRequestById(db, created.id);
  const logs = getServiceRequestLogsByRequestId(db, created.id);
  assert.equal(updated.status, "已联系");
  assert.equal(updated.adminNote, "客户晚上方便沟通");
  assert.ok(logs.some((log) => log.toStatus === "已联系" && log.note === "已电话沟通，补充夹具尺寸"));
  assert.throws(
    () => updateServiceRequestStatus(db, created.id, { status: "未知状态", operator: "admin" }),
    /无效需求状态/,
  );

  db.close();
});

test("request pages and APIs require login for submit while remaining browsable", async () => {
  const designPage = await readSource("src/app/request/design/page.tsx");
  const developmentPage = await readSource("src/app/request/development/page.tsx");
  const formSource = await readSource("src/frontend/components/ServiceRequestForm.tsx");
  const designApi = await readSource("src/app/api/requests/design/route.ts");
  const developmentApi = await readSource("src/app/api/requests/development/route.ts");
  const adminList = await readSource("src/app/admin/requests/page.tsx");
  const adminDetail = await readSource("src/app/admin/requests/[id]/page.tsx");
  const adminStatusApi = await readSource("src/app/api/admin/requests/[id]/status/route.ts");

  assert.match(designPage, /<ServiceRequestForm customer={formCustomer} disabled={!customer} mode="design" \/>/);
  assert.match(developmentPage, /<ServiceRequestForm customer={formCustomer} disabled={!customer} mode="development" \/>/);
  assert.match(formSource, /请先登录后提交需求/);
  assert.match(formSource, /提交修改需求/);
  assert.match(formSource, /提交研发需求/);
  assert.match(formSource, /该预算通常适合简单模型修改或打印，不适合完整产品研发/);
  assert.match(formSource, /name="projectName"/);
  assert.match(formSource, /name="attachments"/);
  assert.match(formSource, /name="budgetRange"/);
  assert.match(formSource, /name="contactPhone"/);

  assert.match(designApi, /getCustomerFromRequestCookie/);
  assert.match(designApi, /status: 401/);
  assert.match(designApi, /createServiceRequest/);
  assert.match(developmentApi, /getCustomerFromRequestCookie/);
  assert.match(developmentApi, /status: 401/);
  assert.match(developmentApi, /requestType: "development"/);

  assert.match(adminList, /searchServiceRequests/);
  assert.match(adminList, /\/admin\/requests\/\$\{request\.id\}/);
  assert.match(adminDetail, /getServiceRequestById/);
  assert.match(adminDetail, /AdminRequestStatusForm/);
  assert.match(adminDetail, /getServiceRequestLogsByRequestId/);
  assert.match(adminStatusApi, /requireAdminSession/);
  assert.match(adminStatusApi, /updateServiceRequestStatus/);
});
