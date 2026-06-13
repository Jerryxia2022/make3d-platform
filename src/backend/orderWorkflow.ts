import type { DatabaseSync } from "node:sqlite";
import {
  getOrderById,
  updateOrderStatus,
  type OrderDetail,
  type OrderStatusUpdateInput,
} from "./database.ts";
import { notifyCustomerOrderStatus } from "./email.ts";
import { notifyWechatOrderStatus, type WechatNotifyResult } from "./wechat.ts";

export type OrderStatusWorkflowResult = {
  updated: boolean;
  order: OrderDetail | null;
  emailError: string | null;
  wechatResult: WechatNotifyResult | null;
  wechatError: string | null;
};

export async function updateOrderStatusAndNotify(
  db: DatabaseSync,
  orderId: number,
  input: OrderStatusUpdateInput,
): Promise<OrderStatusWorkflowResult> {
  const updated = updateOrderStatus(db, orderId, input);

  if (!updated) {
    return {
      updated: false,
      order: null,
      emailError: null,
      wechatResult: null,
      wechatError: null,
    };
  }

  const order = getOrderById(db, orderId);
  const emailError = await notifyByEmail(order);
  const { result: wechatResult, error: wechatError } = await notifyByWechat(db, order);

  return {
    updated: true,
    order,
    emailError,
    wechatResult,
    wechatError,
  };
}

async function notifyByEmail(order: OrderDetail) {
  try {
    await notifyCustomerOrderStatus(order);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "email notification failed";
  }
}

async function notifyByWechat(db: DatabaseSync, order: OrderDetail) {
  try {
    return {
      result: await notifyWechatOrderStatus(db, order),
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      error: error instanceof Error ? error.message : "wechat notification failed",
    };
  }
}
