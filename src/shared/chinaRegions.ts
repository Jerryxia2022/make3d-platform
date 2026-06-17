export type DistrictOption = {
  code: string;
  name: string;
};

export type CityOption = {
  code: string;
  name: string;
  districts: DistrictOption[];
};

export type ProvinceOption = {
  code: string;
  name: string;
  cities: CityOption[];
};

export const OTHER_DISTRICT_CODE = "other";

export const CHINA_REGION_TREE: ProvinceOption[] = [
  {
    code: "610000",
    name: "陕西省",
    cities: [
      {
        code: "610100",
        name: "西安市",
        districts: [
          { code: "610102", name: "新城区" },
          { code: "610103", name: "碑林区" },
          { code: "610104", name: "莲湖区" },
          { code: "610111", name: "灞桥区" },
          { code: "610112", name: "未央区" },
          { code: "610113", name: "雁塔区" },
          { code: "610114", name: "阎良区" },
          { code: "610115", name: "临潼区" },
          { code: "610116", name: "长安区" },
          { code: "610117", name: "高陵区" },
          { code: "610118", name: "鄠邑区" },
        ],
      },
      {
        code: "610200",
        name: "铜川市",
        districts: [
          { code: "610202", name: "王益区" },
          { code: "610203", name: "印台区" },
          { code: "610204", name: "耀州区" },
          { code: "610222", name: "宜君县" },
        ],
      },
      {
        code: "610300",
        name: "宝鸡市",
        districts: [
          { code: "610302", name: "渭滨区" },
          { code: "610303", name: "金台区" },
          { code: "610304", name: "陈仓区" },
          { code: "610305", name: "凤翔区" },
        ],
      },
    ],
  },
  {
    code: "110000",
    name: "北京市",
    cities: [
      {
        code: "110100",
        name: "北京市",
        districts: [
          { code: "110101", name: "东城区" },
          { code: "110102", name: "西城区" },
          { code: "110105", name: "朝阳区" },
          { code: "110106", name: "丰台区" },
          { code: "110108", name: "海淀区" },
        ],
      },
    ],
  },
  {
    code: "310000",
    name: "上海市",
    cities: [
      {
        code: "310100",
        name: "上海市",
        districts: [
          { code: "310101", name: "黄浦区" },
          { code: "310104", name: "徐汇区" },
          { code: "310106", name: "静安区" },
          { code: "310112", name: "闵行区" },
          { code: "310115", name: "浦东新区" },
        ],
      },
    ],
  },
  {
    code: "440000",
    name: "广东省",
    cities: [
      {
        code: "440100",
        name: "广州市",
        districts: [
          { code: "440103", name: "荔湾区" },
          { code: "440104", name: "越秀区" },
          { code: "440105", name: "海珠区" },
          { code: "440106", name: "天河区" },
        ],
      },
      {
        code: "440300",
        name: "深圳市",
        districts: [
          { code: "440303", name: "罗湖区" },
          { code: "440304", name: "福田区" },
          { code: "440305", name: "南山区" },
          { code: "440306", name: "宝安区" },
          { code: "440307", name: "龙岗区" },
          { code: "440309", name: "龙华区" },
        ],
      },
    ],
  },
  {
    code: "330000",
    name: "浙江省",
    cities: [
      {
        code: "330100",
        name: "杭州市",
        districts: [
          { code: "330102", name: "上城区" },
          { code: "330105", name: "拱墅区" },
          { code: "330106", name: "西湖区" },
          { code: "330108", name: "滨江区" },
          { code: "330109", name: "萧山区" },
          { code: "330110", name: "余杭区" },
        ],
      },
    ],
  },
];

export function getProvinceByCode(code: string) {
  return CHINA_REGION_TREE.find((province) => province.code === code) || null;
}

export function getCityByCode(provinceCode: string, cityCode: string) {
  return getProvinceByCode(provinceCode)?.cities.find((city) => city.code === cityCode) || null;
}

export function getDistrictByCode(
  provinceCode: string,
  cityCode: string,
  districtCode: string,
) {
  return getCityByCode(provinceCode, cityCode)?.districts.find((district) => district.code === districtCode) || null;
}
