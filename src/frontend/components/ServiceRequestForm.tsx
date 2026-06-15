"use client";

import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  mainlandPhoneErrorMessage,
  mainlandPhoneHtmlPattern,
} from "@/shared/phoneValidation";

type RequestMode = "design" | "development";

type RequestFormCustomer = {
  name: string;
  phone: string;
  wechat: string;
  email: string | null;
};

const designBudgets = ["100元以内", "100-500元", "500-2000元", "2000元以上", "不确定，需评估"];
const developmentBudgets = ["500元以内", "500-2000元", "2000-10000元", "10000元以上", "不确定，需评估"];
const projectTypes = ["工装夹具", "电子产品", "自动化机构", "外壳结构", "PCB/电路", "程序控制", "其他"];
const fullDevelopmentTypes = new Set(["电子产品", "自动化机构", "外壳结构", "PCB/电路", "程序控制"]);
const attachmentAccept = ".stl,.step,.stp,.pdf,.jpg,.jpeg,.png,.dxf,.dwg,.zip,.rar,.7z";
const loginMessage = "请先登录后提交需求";

export function ServiceRequestForm({
  customer,
  disabled = false,
  mode,
}: {
  customer?: RequestFormCustomer | null;
  disabled?: boolean;
  mode: RequestMode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [budgetRange, setBudgetRange] = useState("");
  const [projectType, setProjectType] = useState(projectTypes[0]);
  const [message, setMessage] = useState("");
  const [successId, setSuccessId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const budgets = mode === "design" ? designBudgets : developmentBudgets;
  const endpoint = mode === "design" ? "/api/requests/design" : "/api/requests/development";
  const showDevelopmentBudgetWarning = useMemo(
    () => mode === "development" && budgetRange === "500元以内" && fullDevelopmentTypes.has(projectType),
    [budgetRange, mode, projectType],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccessId(null);

    if (disabled) {
      setMessage(loginMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "需求提交失败");
      }

      setSuccessId(result.id);
      setMessage("需求已提交，通常 24 小时内评估。工作日晚上和周末优先处理复杂沟通。");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "需求提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="surface-card p-5 sm:p-6"
      encType="multipart/form-data"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {disabled ? (
        <div className="notice-warning mb-5 px-4 py-3 text-sm">
          <p className="font-semibold text-coral">{loginMessage}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link className="btn-primary px-4 py-2" href={`/account/login?next=${encodeURIComponent(mode === "design" ? "/request/design" : "/request/development")}`}>
              登录
            </Link>
            <Link className="btn-secondary px-4 py-2" href="/account/register">
              注册
            </Link>
          </div>
        </div>
      ) : null}

      <FormSection title="项目基本信息">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField disabled={disabled} label="项目名称" name="projectName" required />
          {mode === "development" ? (
            <label className="block text-sm font-semibold">
              项目类型
              <select
                className="field-input mt-2"
                disabled={disabled}
                name="projectType"
                onChange={(event) => setProjectType(event.target.value)}
                value={projectType}
              >
                {projectTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block text-sm font-semibold">
              是否需要打印
              <select
                className="field-input mt-2"
                disabled={disabled}
                name="needsPrinting"
                defaultValue="需要修改并打印"
              >
                <option>需要修改并打印</option>
                <option>只需要模型修改</option>
                <option>不确定，需评估</option>
              </select>
            </label>
          )}
        </div>
      </FormSection>

      {mode === "design" ? (
        <FormSection title="修改需求">
          <TextArea
            disabled={disabled}
            label="修改说明"
            name="modificationNotes"
            placeholder="例如：改尺寸、加孔、拆件、加厚、优化支撑或打印方向"
            required
            rows={5}
          />
          <TextArea
            disabled={disabled}
            label="关键尺寸"
            name="keyDimensions"
            placeholder="填写必须保持或需要调整的尺寸、公差、装配关系"
            rows={3}
          />
          <FileField disabled={disabled} label="现有文件上传" />
        </FormSection>
      ) : (
        <FormSection title="研发需求">
          <TextArea
            disabled={disabled}
            label="功能描述"
            name="functionDescription"
            placeholder="描述目标功能、使用场景、安装空间、载荷、电源、控制方式等"
            required
            rows={6}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              disabled={disabled}
              label="是否已有图纸或样品"
              name="hasDrawingsOrSample"
              options={["已有图纸", "已有样品", "都没有", "不确定"]}
            />
            <SelectField
              disabled={disabled}
              label="是否需要上门测量"
              name="needsOnsiteMeasurement"
              options={["不需要", "可能需要", "需要"]}
            />
            <SelectField
              disabled={disabled}
              label="晚上或周末沟通"
              name="acceptsEveningOrWeekendContact"
              options={["接受", "仅工作日", "再协调"]}
            />
          </div>
          <FileField disabled={disabled} label="附件上传" />
        </FormSection>
      )}

      <FormSection title="预算与交付">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            预算范围
            <select
              className="field-input mt-2"
              disabled={disabled}
              name="budgetRange"
              onChange={(event) => setBudgetRange(event.target.value)}
              required
              value={budgetRange}
            >
              <option value="">请选择预算范围</option>
              {budgets.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <TextField
            disabled={disabled}
            label="期望交付时间"
            name="expectedDeliveryTime"
            placeholder="例如：一周内、6月下旬、越快越好"
          />
        </div>
        {showDevelopmentBudgetWarning ? (
          <p className="notice-warning mt-4 px-4 py-3 text-sm font-semibold leading-6">
            该预算通常适合简单模型修改或打印，不适合完整产品研发。复杂项目建议提供明确图纸、样品或功能说明后评估。
          </p>
        ) : null}
      </FormSection>

      <FormSection title="联系方式">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            autoComplete="name"
            defaultValue={customer?.name || ""}
            disabled={disabled}
            label="联系人"
            name="contactName"
            required
          />
          <TextField
            autoComplete="tel"
            defaultValue={customer?.phone || ""}
            disabled={disabled}
            inputMode="numeric"
            label="手机号"
            maxLength={11}
            name="contactPhone"
            pattern={mainlandPhoneHtmlPattern}
            required
            title={mainlandPhoneErrorMessage}
            type="tel"
          />
          <TextField
            autoComplete="off"
            defaultValue={customer?.wechat || ""}
            disabled={disabled}
            label="微信"
            name="contactWechat"
          />
          <TextField
            autoComplete="email"
            defaultValue={customer?.email || ""}
            disabled={disabled}
            label="邮箱"
            name="contactEmail"
            type="email"
          />
        </div>
        <TextArea
          disabled={disabled}
          label="备注"
          name="remarks"
          placeholder="补充沟通时间、发票、材料偏好、保密要求等"
          rows={3}
        />
      </FormSection>

      {message ? (
        <p className={successId ? "notice-success mt-5 px-4 py-3 text-sm font-semibold" : "notice-warning mt-5 px-4 py-3 text-sm font-semibold"}>
          {message}
          {successId ? <span className="ml-2 text-graphite">需求编号：#{successId}</span> : null}
        </p>
      ) : null}

      <button
        className="btn-primary mt-5 w-full px-5 py-3"
        disabled={disabled || isSubmitting}
        type="submit"
      >
        {isSubmitting ? "提交中..." : mode === "design" ? "提交修改需求" : "提交研发需求"}
      </button>
    </form>
  );
}

function FormSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border-b border-ink/10 py-5 first:pt-0 last:border-b-0">
      <h2 className="text-base font-bold">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function TextField({
  autoComplete,
  defaultValue,
  disabled,
  inputMode,
  label,
  maxLength,
  name,
  pattern,
  placeholder,
  required,
  title,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue?: string;
  disabled?: boolean;
  inputMode?: "email" | "numeric" | "search" | "tel" | "text" | "url";
  label: string;
  maxLength?: number;
  name: string;
  pattern?: string;
  placeholder?: string;
  required?: boolean;
  title?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        autoComplete={autoComplete}
        className="field-input mt-2"
        defaultValue={defaultValue}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        pattern={pattern}
        placeholder={placeholder}
        required={required}
        title={title}
        type={type}
      />
    </label>
  );
}

function TextArea({
  disabled,
  label,
  name,
  placeholder,
  required,
  rows,
}: {
  disabled?: boolean;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  rows: number;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <textarea
        className="field-input mt-2"
        disabled={disabled}
        name={name}
        placeholder={placeholder}
        required={required}
        rows={rows}
      />
    </label>
  );
}

function SelectField({
  disabled,
  label,
  name,
  options,
}: {
  disabled?: boolean;
  label: string;
  name: string;
  options: string[];
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <select className="field-input mt-2" disabled={disabled} name={name}>
        {options.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}

function FileField({ disabled, label }: { disabled?: boolean; label: string }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        accept={attachmentAccept}
        className="mt-2 w-full rounded-md border border-dashed border-ink/25 bg-white px-3 py-3 text-sm font-normal"
        disabled={disabled}
        multiple
        name="attachments"
        type="file"
      />
      <span className="mt-2 block text-xs leading-5 text-graphite">
        支持模型、图纸、图片、PDF、压缩包等资料，单个附件最大 50MB。
      </span>
    </label>
  );
}
