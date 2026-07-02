export type MaterialGuidance = {
  material: "PLA" | "PETG" | "ABS";
  softeningTemperature: string;
  strength: string;
  toughness: string;
  useCases: string;
  notes: string;
};

export const MATERIAL_GUIDANCE_UPDATED_AT = "2026-07-02";

export const MATERIAL_GUIDANCE: MaterialGuidance[] = [
  {
    material: "PLA",
    softeningTemperature: "约 55-65 C",
    strength: "刚性较好，承载冲击和高温环境需谨慎",
    toughness: "偏硬，韧性一般",
    useCases: "展示件、外观样件、低温使用的结构验证件",
    notes: "不建议用于车内、高温设备附近或长期受力场景。",
  },
  {
    material: "PETG",
    softeningTemperature: "约 70-85 C",
    strength: "综合强度较均衡，层间结合通常较好",
    toughness: "韧性较好，刚性低于 PLA",
    useCases: "功能样件、夹具、一般结构件、需要一定韧性的零件",
    notes: "表面细节和悬垂表现受模型结构影响较大。",
  },
  {
    material: "ABS",
    softeningTemperature: "约 90-105 C",
    strength: "耐热性和后处理空间较好",
    toughness: "韧性较好，打印收缩风险较高",
    useCases: "耐热功能件、需要打磨或喷漆处理的样件",
    notes: "大尺寸或薄壁结构可能翘曲，需要人工确认可行性。",
  },
];
