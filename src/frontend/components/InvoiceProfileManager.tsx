"use client";

import { useState } from "react";
import {
  INVOICE_PROFILE_LIMIT,
  INVOICE_TYPE_LABELS,
  type InvoiceType,
  maskTaxpayerId,
} from "@/shared/invoice";

type InvoiceProfileView = {
  id: number;
  invoiceType: Extract<InvoiceType, "ordinary" | "special">;
  title: string;
  taxpayerId: string;
  registeredAddress: string | null;
  registeredPhone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  receiverContact: string;
  isDefault: boolean;
};

const emptyForm = {
  invoiceType: "ordinary" as Extract<InvoiceType, "ordinary" | "special">,
  title: "",
  taxpayerId: "",
  registeredAddress: "",
  registeredPhone: "",
  bankName: "",
  bankAccount: "",
  receiverContact: "",
  isDefault: false,
};

type InvoiceProfileForm = typeof emptyForm;

export function InvoiceProfileManager({
  initialProfiles,
}: {
  initialProfiles: InvoiceProfileView[];
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [form, setForm] = useState<InvoiceProfileForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = editingId != null;
  const canCreate = profiles.length < INVOICE_PROFILE_LIMIT;
  const isSpecial = form.invoiceType === "special";
  const limitMessage = `每个客户最多保存 ${INVOICE_PROFILE_LIMIT} 条发票资料`;

  function updateForm(key: keyof InvoiceProfileForm, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setMessage("");
  }

  function startEdit(profile: InvoiceProfileView) {
    setEditingId(profile.id);
    setForm({
      invoiceType: profile.invoiceType,
      title: profile.title,
      taxpayerId: profile.taxpayerId,
      registeredAddress: profile.registeredAddress || "",
      registeredPhone: profile.registeredPhone || "",
      bankName: profile.bankName || "",
      bankAccount: profile.bankAccount || "",
      receiverContact: profile.receiverContact,
      isDefault: profile.isDefault,
    });
    setError("");
    setMessage("");
  }

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isEditing && !canCreate) {
      setError(limitMessage);
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        isEditing ? `/api/account/invoices/${editingId}` : "/api/account/invoices",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(form),
        },
      );
      const result = await response.json().catch(() => ({})) as {
        profiles?: InvoiceProfileView[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "发票资料保存失败");
      }

      setProfiles(result.profiles || []);
      setEditingId(null);
      setForm(emptyForm);
      setMessage("发票资料已保存");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "发票资料保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteProfile(profile: InvoiceProfileView) {
    if (!window.confirm("确定删除该发票资料吗？")) {
      return;
    }

    await mutateProfile(`/api/account/invoices/${profile.id}`, "DELETE", "发票资料已删除");
  }

  async function setDefault(profile: InvoiceProfileView) {
    await mutateProfile(`/api/account/invoices/${profile.id}/default`, "POST", "默认发票资料已更新");
  }

  async function mutateProfile(url: string, method: "DELETE" | "POST", successMessage: string) {
    setError("");
    setMessage("");

    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({})) as {
        profiles?: InvoiceProfileView[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "操作失败");
      }

      setProfiles(result.profiles || []);
      setEditingId(null);
      setForm(emptyForm);
      setMessage(successMessage);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "操作失败");
    }
  }

  return (
    <div className="mt-5 grid gap-5">
      <section className="surface-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">发票资料</h2>
            <p className="mt-1 text-sm text-graphite">
              已保存 {profiles.length}/{INVOICE_PROFILE_LIMIT} 条资料。订单提交时会保存当时选择的资料快照。
            </p>
          </div>
          <button className="btn-secondary px-4 py-2" disabled={!canCreate} onClick={startCreate} type="button">
            新增资料
          </button>
        </div>

        {!canCreate ? (
          <p className="notice-warning mt-4 px-4 py-3 text-sm font-semibold">{limitMessage}</p>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {profiles.length === 0 ? (
            <div className="surface-soft p-5 text-sm text-graphite md:col-span-2">
              还没有发票资料。需要开票时，请先添加对应类型的资料。
            </div>
          ) : (
            profiles.map((profile) => (
              <article className="surface-card p-4 transition hover:border-orange-200 hover:shadow-md" key={profile.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="status-pill status-gray">
                    {INVOICE_TYPE_LABELS[profile.invoiceType]}
                  </span>
                  {profile.isDefault ? <span className="status-pill status-orange">默认资料</span> : null}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p className="font-bold">{profile.title}</p>
                  <p className="text-graphite">税号：{maskTaxpayerId(profile.taxpayerId)}</p>
                  <p className="text-graphite">接收：{profile.receiverContact}</p>
                  {profile.invoiceType === "special" ? (
                    <p className="text-graphite">
                      专票资料：{profile.registeredAddress} / {profile.registeredPhone} / {profile.bankName}
                    </p>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-3">
                  {!profile.isDefault ? (
                    <button className="btn-primary px-3 py-2 text-xs" onClick={() => setDefault(profile)} type="button">
                      设为默认
                    </button>
                  ) : null}
                  <button className="btn-secondary px-3 py-2 text-xs" onClick={() => startEdit(profile)} type="button">
                    编辑
                  </button>
                  <button className="btn-secondary px-3 py-2 text-xs" onClick={() => deleteProfile(profile)} type="button">
                    删除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <form className="surface-card grid gap-4 p-5" onSubmit={submitProfile}>
        <div>
          <h2 className="text-xl font-bold">{isEditing ? "编辑发票资料" : "新增发票资料"}</h2>
          <p className="mt-1 text-sm text-graphite">
            提交订单前请确认发票类型和资料，订单提交后原则上不支持变更发票类型。
          </p>
        </div>

        <label className="block text-sm font-semibold">
          发票类型
          <select
            className="field-input mt-2"
            onChange={(event) => updateForm("invoiceType", event.target.value)}
            value={form.invoiceType}
          >
            <option value="ordinary">{INVOICE_TYPE_LABELS.ordinary}</option>
            <option value="special">{INVOICE_TYPE_LABELS.special}</option>
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="发票抬头全称" name="title" onChange={updateForm} required value={form.title} />
          <TextField label="纳税人识别号/统一社会信用代码" name="taxpayerId" onChange={updateForm} required value={form.taxpayerId} />
          {isSpecial ? (
            <>
              <TextField label="注册地址" name="registeredAddress" onChange={updateForm} required value={form.registeredAddress} />
              <TextField label="注册电话" name="registeredPhone" onChange={updateForm} required value={form.registeredPhone} />
              <TextField label="开户银行" name="bankName" onChange={updateForm} required value={form.bankName} />
              <TextField label="银行账号" name="bankAccount" onChange={updateForm} required value={form.bankAccount} />
            </>
          ) : null}
          <TextField label="接收邮箱或手机号" name="receiverContact" onChange={updateForm} required value={form.receiverContact} />
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            checked={form.isDefault}
            onChange={(event) => updateForm("isDefault", event.target.checked)}
            type="checkbox"
          />
          设为默认发票资料
        </label>

        {error ? <p className="notice-warning px-4 py-3 text-sm font-semibold">{error}</p> : null}
        {message ? <p className="notice-success px-4 py-3 text-sm font-semibold">{message}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button className="btn-primary px-5 py-3" disabled={isSaving || (!isEditing && !canCreate)} type="submit">
            {isSaving ? "保存中..." : "保存发票资料"}
          </button>
          {isEditing ? (
            <button className="btn-secondary px-5 py-3" onClick={startCreate} type="button">
              取消编辑
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  name,
  onChange,
  required = false,
  value,
}: {
  label: string;
  name: keyof InvoiceProfileForm;
  onChange: (key: keyof InvoiceProfileForm, value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="field-input mt-2"
        name={name}
        onChange={(event) => onChange(name, event.target.value)}
        required={required}
        value={value}
      />
    </label>
  );
}
