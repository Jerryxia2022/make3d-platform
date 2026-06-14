export type CustomerAddressView = {
  id: number;
  customerId: number;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detailAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export function formatCustomerAddress(address: Pick<
  CustomerAddressView,
  "province" | "city" | "district" | "detailAddress"
>) {
  return [address.province, address.city, address.district, address.detailAddress]
    .filter(Boolean)
    .join(" ");
}

export function getDefaultAddress(addresses: CustomerAddressView[]) {
  return addresses.find((address) => address.isDefault) || addresses[0] || null;
}
