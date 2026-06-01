export const ORDER_STATUSES = ["待处理", "已报价", "生产中", "已完成", "已取消"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(status: string): status is OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus);
}
