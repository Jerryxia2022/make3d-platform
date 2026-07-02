export type CustomerAddressView = {
  id: number;
  customerId: number;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  cityCustom: string | null;
  district: string;
  provinceCode: string | null;
  provinceName: string | null;
  cityCode: string | null;
  cityName: string | null;
  districtCode: string | null;
  districtName: string | null;
  districtCustom: string | null;
  detailAddress: string;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export function formatCustomerAddress(address: Pick<
  CustomerAddressView,
  "province" | "city" | "cityCustom" | "district" | "detailAddress" | "districtCustom"
>) {
  return [address.province, address.cityCustom || address.city, address.districtCustom || address.district, address.detailAddress]
    .filter(Boolean)
    .join(" ");
}

export function getDefaultAddress(addresses: CustomerAddressView[]) {
  return addresses.find((address) => address.isDefault) || addresses[0] || null;
}
