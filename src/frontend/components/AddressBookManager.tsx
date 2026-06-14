"use client";

import { useMemo, useState } from "react";
import {
  formatCustomerAddress,
  type CustomerAddressView,
} from "@/frontend/lib/customer-addresses";
import { mainlandPhoneHtmlPattern, mainlandPhoneErrorMessage } from "@/shared/phoneValidation";

const emptyForm = {
  recipientName: "",
  phone: "",
  province: "",
  city: "",
  district: "",
  detailAddress: "",
  postalCode: "",
  label: "",
  isDefault: false,
};

type AddressFormState = typeof emptyForm;

export function AddressBookManager({
  initialAddresses,
}: {
  initialAddresses: CustomerAddressView[];
}) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [form, setForm] = useState<AddressFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const canCreate = addresses.length < 5;
  const isEditing = editingId != null;
  const formTitle = isEditing ? "编辑地址" : "新增地址";
  const limitMessage = "最多可保存 5 个常用地址，如需新增请先删除旧地址。";
  const defaultCount = useMemo(
    () => addresses.filter((address) => address.isDefault).length,
    [addresses],
  );

  function updateForm(key: keyof AddressFormState, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setMessage("");
  }

  function startEdit(address: CustomerAddressView) {
    setEditingId(address.id);
    setForm({
      recipientName: address.recipientName,
      phone: address.phone,
      province: address.province,
      city: address.city,
      district: address.district,
      detailAddress: address.detailAddress,
      postalCode: address.postalCode || "",
      label: address.label || "",
      isDefault: address.isDefault,
    });
    setError("");
    setMessage("");
  }

  async function submitAddress(event: React.FormEvent<HTMLFormElement>) {
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
        isEditing ? `/api/account/addresses/${editingId}` : "/api/account/addresses",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(form),
        },
      );
      const result = await response.json().catch(() => ({})) as {
        addresses?: CustomerAddressView[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "地址保存失败");
      }

      setAddresses(result.addresses || []);
      setEditingId(null);
      setForm(emptyForm);
      setMessage("地址已保存");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "地址保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAddress(address: CustomerAddressView) {
    if (!window.confirm("确定删除该地址吗？")) {
      return;
    }

    await mutateAddress(`/api/account/addresses/${address.id}`, "DELETE", "地址已删除");
  }

  async function setDefault(address: CustomerAddressView) {
    await mutateAddress(`/api/account/addresses/${address.id}/default`, "POST", "默认地址已更新");
  }

  async function mutateAddress(url: string, method: "DELETE" | "POST", successMessage: string) {
    setError("");
    setMessage("");

    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({})) as {
        addresses?: CustomerAddressView[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "操作失败");
      }

      setAddresses(result.addresses || []);
      setEditingId(null);
      setForm(emptyForm);
      setMessage(successMessage);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "操作失败");
    }
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <section className="border border-ink/10 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">常用地址</h2>
            <p className="mt-1 text-sm text-graphite">
              已保存 {addresses.length}/5 个地址，默认地址会在报价页自动选中。
            </p>
          </div>
          <button
            className="border border-ink/20 px-4 py-2 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:text-graphite"
            disabled={!canCreate}
            onClick={startCreate}
            type="button"
          >
            新增地址
          </button>
        </div>

        {!canCreate ? (
          <p className="mt-4 border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
            {limitMessage}
          </p>
        ) : null}

        {defaultCount > 1 ? (
          <p className="mt-4 border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
            地址默认状态异常，请重新设置一个默认地址。
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {addresses.length === 0 ? (
            <div className="border border-ink/10 bg-white p-5 text-sm text-graphite md:col-span-2">
              还没有收货地址，请先添加一个常用地址。
            </div>
          ) : (
            addresses.map((address) => (
              <article className="border border-ink/10 bg-white p-4" key={address.id}>
                <div className="flex flex-wrap items-center gap-2">
                  {address.label ? (
                    <span className="border border-ink/10 bg-paper px-2 py-1 text-xs font-bold text-ink">
                      {address.label}
                    </span>
                  ) : null}
                  {address.isDefault ? (
                    <span className="border border-coral/30 bg-coral/10 px-2 py-1 text-xs font-bold text-coral">
                      默认地址
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <p className="font-bold">{address.recipientName} / {address.phone}</p>
                  <p className="leading-6 text-graphite">{formatCustomerAddress(address)}</p>
                  {address.postalCode ? <p className="text-graphite">邮编：{address.postalCode}</p> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-3">
                  {!address.isDefault ? (
                    <button
                      className="bg-ink px-3 py-2 text-xs font-semibold text-white"
                      onClick={() => setDefault(address)}
                      type="button"
                    >
                      设为默认
                    </button>
                  ) : null}
                  <button
                    className="border border-ink/20 px-3 py-2 text-xs font-semibold text-ink"
                    onClick={() => startEdit(address)}
                    type="button"
                  >
                    编辑
                  </button>
                  <button
                    className="border border-coral/30 px-3 py-2 text-xs font-semibold text-coral"
                    onClick={() => deleteAddress(address)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {(canCreate || isEditing) ? (
        <section className="border border-ink/10 bg-white/80 p-5 shadow-sm lg:sticky lg:top-6">
          <h2 className="text-xl font-bold">{formTitle}</h2>
          <form className="mt-5 space-y-4" onSubmit={submitAddress}>
            <AddressInput label="收件人姓名" required value={form.recipientName} onChange={(value) => updateForm("recipientName", value)} />
            <AddressInput
              inputMode="numeric"
              label="手机号"
              maxLength={11}
              pattern={mainlandPhoneHtmlPattern}
              required
              title={mainlandPhoneErrorMessage}
              type="tel"
              value={form.phone}
              onChange={(value) => updateForm("phone", value)}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <AddressInput label="省" required value={form.province} onChange={(value) => updateForm("province", value)} />
              <AddressInput label="市" required value={form.city} onChange={(value) => updateForm("city", value)} />
              <AddressInput label="区/县" required value={form.district} onChange={(value) => updateForm("district", value)} />
            </div>
            <AddressTextarea label="详细地址" required value={form.detailAddress} onChange={(value) => updateForm("detailAddress", value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <AddressInput inputMode="numeric" label="邮编（可选）" maxLength={10} pattern="[0-9]{0,10}" value={form.postalCode} onChange={(value) => updateForm("postalCode", value)} />
              <AddressInput label="标签（可选）" maxLength={10} value={form.label} onChange={(value) => updateForm("label", value)} />
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                checked={form.isDefault}
                className="h-4 w-4"
                onChange={(event) => updateForm("isDefault", event.target.checked)}
                type="checkbox"
              />
              设为默认地址
            </label>

            {error ? <p className="border border-coral/30 bg-coral/10 px-3 py-2 text-sm font-semibold text-coral">{error}</p> : null}
            {message ? <p className="border border-mint/30 bg-mint/10 px-3 py-2 text-sm font-semibold text-ink">{message}</p> : null}

            <div className="flex gap-3">
              <button
                className="bg-ink px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-graphite/60"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "保存中..." : "保存地址"}
              </button>
              {isEditing ? (
                <button
                  className="border border-ink/20 px-5 py-3 text-sm font-semibold text-ink"
                  onClick={startCreate}
                  type="button"
                >
                  取消编辑
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function AddressInput({
  inputMode,
  label,
  maxLength,
  onChange,
  pattern,
  required = false,
  title,
  type = "text",
  value,
}: {
  inputMode?: "numeric" | "text" | "tel";
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  pattern?: string;
  required?: boolean;
  title?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="mt-2 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        pattern={pattern}
        required={required}
        title={title}
        type={type}
        value={value}
      />
    </label>
  );
}

function AddressTextarea({
  label,
  onChange,
  required = false,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <textarea
        className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
        minLength={5}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        value={value}
      />
    </label>
  );
}
