export const ORDER_STATUSES = [
  "待确认",
  "待付款",
  "已付款",
  "排产中",
  "生产中",
  "后处理",
  "已发货",
  "已完成",
  "已取消",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(status: string): status is OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus);
}
