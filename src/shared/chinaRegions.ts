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
export const CHINA_REGION_DATA_VERSION = "2026-07-02-local-supplement";
export const CHINA_REGION_DATA_UPDATED_AT = "2026-07-02";

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
          { code: "610323", name: "岐山县" },
          { code: "610324", name: "扶风县" },
          { code: "610326", name: "眉县" },
          { code: "610327", name: "陇县" },
          { code: "610328", name: "千阳县" },
          { code: "610329", name: "麟游县" },
          { code: "610330", name: "凤县" },
          { code: "610331", name: "太白县" },
        ],
      },
      {
        code: "610400",
        name: "咸阳市",
        districts: [
          { code: "610402", name: "秦都区" },
          { code: "610403", name: "杨陵区" },
          { code: "610404", name: "渭城区" },
          { code: "610422", name: "三原县" },
          { code: "610423", name: "泾阳县" },
          { code: "610424", name: "乾县" },
          { code: "610425", name: "礼泉县" },
          { code: "610426", name: "永寿县" },
          { code: "610428", name: "长武县" },
          { code: "610429", name: "旬邑县" },
          { code: "610430", name: "淳化县" },
          { code: "610431", name: "武功县" },
          { code: "610481", name: "兴平市" },
          { code: "610482", name: "彬州市" },
        ],
      },
      {
        code: "610500",
        name: "渭南市",
        districts: [
          { code: "610502", name: "临渭区" },
          { code: "610503", name: "华州区" },
          { code: "610522", name: "潼关县" },
          { code: "610523", name: "大荔县" },
          { code: "610524", name: "合阳县" },
          { code: "610525", name: "澄城县" },
          { code: "610526", name: "蒲城县" },
          { code: "610527", name: "白水县" },
          { code: "610528", name: "富平县" },
          { code: "610581", name: "韩城市" },
          { code: "610582", name: "华阴市" },
        ],
      },
      {
        code: "610600",
        name: "延安市",
        districts: [
          { code: "610602", name: "宝塔区" },
          { code: "610603", name: "安塞区" },
          { code: "610621", name: "延长县" },
          { code: "610622", name: "延川县" },
          { code: "610625", name: "志丹县" },
          { code: "610626", name: "吴起县" },
          { code: "610627", name: "甘泉县" },
          { code: "610628", name: "富县" },
          { code: "610629", name: "洛川县" },
          { code: "610630", name: "宜川县" },
          { code: "610631", name: "黄龙县" },
          { code: "610632", name: "黄陵县" },
          { code: "610681", name: "子长市" },
        ],
      },
      {
        code: "610700",
        name: "汉中市",
        districts: [
          { code: "610702", name: "汉台区" },
          { code: "610703", name: "南郑区" },
          { code: "610722", name: "城固县" },
          { code: "610723", name: "洋县" },
          { code: "610724", name: "西乡县" },
          { code: "610725", name: "勉县" },
          { code: "610726", name: "宁强县" },
          { code: "610727", name: "略阳县" },
          { code: "610728", name: "镇巴县" },
          { code: "610729", name: "留坝县" },
          { code: "610730", name: "佛坪县" },
        ],
      },
      {
        code: "610800",
        name: "榆林市",
        districts: [
          { code: "610802", name: "榆阳区" },
          { code: "610803", name: "横山区" },
          { code: "610822", name: "府谷县" },
          { code: "610824", name: "靖边县" },
          { code: "610825", name: "定边县" },
          { code: "610826", name: "绥德县" },
          { code: "610827", name: "米脂县" },
          { code: "610828", name: "佳县" },
          { code: "610829", name: "吴堡县" },
          { code: "610830", name: "清涧县" },
          { code: "610831", name: "子洲县" },
          { code: "610881", name: "神木市" },
        ],
      },
      {
        code: "610900",
        name: "安康市",
        districts: [
          { code: "610902", name: "汉滨区" },
          { code: "610921", name: "汉阴县" },
          { code: "610922", name: "石泉县" },
          { code: "610923", name: "宁陕县" },
          { code: "610924", name: "紫阳县" },
          { code: "610925", name: "岚皋县" },
          { code: "610926", name: "平利县" },
          { code: "610927", name: "镇坪县" },
          { code: "610929", name: "白河县" },
          { code: "610981", name: "旬阳市" },
        ],
      },
      {
        code: "611000",
        name: "商洛市",
        districts: [
          { code: "611002", name: "商州区" },
          { code: "611021", name: "洛南县" },
          { code: "611022", name: "丹凤县" },
          { code: "611023", name: "商南县" },
          { code: "611024", name: "山阳县" },
          { code: "611025", name: "镇安县" },
          { code: "611026", name: "柞水县" },
        ],
      },
      {
        code: "619000",
        name: "杨凌示范区",
        districts: [
          { code: "619001", name: "杨陵区" },
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
