"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatBytes, type QuoteDimensions } from "@/frontend/lib/quote-estimates";
import {
  formatStlDimensions,
  getStlDimensionNotice,
  isStlFilename,
  loadStlGeometry,
  MAX_AUTO_STL_PREVIEW_BYTES,
  readStlDimensions,
  renderStlThumbnail,
  shouldAutoLoadStlPreview,
  createStlViewer,
  type StlDimensions,
  type StlViewerHandle,
} from "@/frontend/lib/stl-preview";

type StlModelPreviewProps = {
  file?: File;
  fileUrl?: string;
  filename: string;
  filesize: number;
  dimensions?: QuoteDimensions | null;
  material?: string | null;
  color?: string | null;
  quantity?: number | null;
  quoteStatus?: string | null;
  compact?: boolean;
  onDimensions?: (dimensions: QuoteDimensions) => void;
};

type LoadStatus = "idle" | "loading" | "ready" | "failed" | "skipped";

export function StlModelPreview({
  file,
  fileUrl,
  filename,
  filesize,
  dimensions,
  material,
  color,
  quantity,
  quoteStatus,
  compact = false,
  onDimensions,
}: StlModelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onDimensionsRef = useRef(onDimensions);
  const [status, setStatus] = useState<LoadStatus>(() =>
    shouldAutoLoadStlPreview(filename, filesize) ? "idle" : "skipped",
  );
  const [detectedDimensions, setDetectedDimensions] = useState<StlDimensions | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const isStl = isStlFilename(filename);
  const autoLoad = shouldAutoLoadStlPreview(filename, filesize);
  const normalizedDimensions = useMemo(
    () => normalizeDimensions(dimensions) || detectedDimensions,
    [detectedDimensions, dimensions],
  );
  const dimensionText = formatStlDimensions(normalizedDimensions);
  const dimensionNotice = getStlDimensionNotice(normalizedDimensions);
  const title = isStl
    ? autoLoad
      ? "点击查看3D模型"
      : "文件较大，点击后加载3D预览"
    : "非 STL 文件暂无浏览器 3D 预览";

  useEffect(() => {
    onDimensionsRef.current = onDimensions;
  }, [onDimensions]);

  const reportDimensions = useCallback(
    (nextDimensions: StlDimensions | null) => {
      if (!nextDimensions) {
        return;
      }

      setDetectedDimensions(nextDimensions);
      onDimensionsRef.current?.(nextDimensions);
    },
    [],
  );

  useEffect(() => {
    let disposed = false;
    let disposeThumbnail: (() => void) | undefined;

    setStatus(autoLoad ? "loading" : "skipped");

    if (!isStl || !autoLoad || !canvasRef.current) {
      return () => {
        disposeThumbnail?.();
      };
    }

    loadStlGeometry({ file, url: fileUrl })
      .then(async (geometry) => {
        if (disposed) {
          geometry.dispose();
          return;
        }

        reportDimensions(readStlDimensions(geometry));
        disposeThumbnail = await renderStlThumbnail(canvasRef.current as HTMLCanvasElement, geometry);
        geometry.dispose();

        if (!disposed) {
          setStatus("ready");
        }
      })
      .catch((error) => {
        console.error("STL thumbnail preview failed", error);
        if (!disposed) {
          setStatus("failed");
        }
      });

    return () => {
      disposed = true;
      disposeThumbnail?.();
    };
  }, [autoLoad, file, fileUrl, isStl, reportDimensions]);

  const openPreview = () => {
    if (!isStl) {
      return;
    }

    setModalOpen(true);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <button
        aria-label={isStl ? `查看3D模型 ${filename}` : `文件 ${filename}`}
        className={
          compact
            ? "relative flex h-28 w-36 items-center justify-center overflow-hidden border border-ink/10 bg-ash text-xs text-graphite"
            : "relative flex h-32 w-full max-w-44 items-center justify-center overflow-hidden border border-ink/10 bg-ash text-xs text-graphite"
        }
        disabled={!isStl}
        onClick={openPreview}
        title={title}
        type="button"
      >
        <canvas
          className={status === "ready" ? "h-full w-full" : "absolute inset-0 h-full w-full opacity-0"}
          ref={canvasRef}
        />
        {status !== "ready" ? (
          <span className="px-3 text-center font-semibold leading-5">
            {getPreviewPlaceholder(status, isStl, filesize)}
          </span>
        ) : null}
      </button>

      <div className="space-y-1 text-xs leading-5 text-graphite">
        <p className="font-semibold text-ink">XYZ {dimensionText}</p>
        {dimensionNotice ? <p className="font-semibold text-coral">{dimensionNotice}</p> : null}
        {status === "failed" ? (
          <p className="font-semibold text-coral">模型预览加载失败，不影响报价提交，请确认文件是否正确。</p>
        ) : null}
        {!autoLoad && isStl && filesize > MAX_AUTO_STL_PREVIEW_BYTES ? (
          <button className="font-semibold text-coral" onClick={openPreview} type="button">
            点击加载预览
          </button>
        ) : null}
      </div>

      {isStl ? (
        <button className="text-xs font-semibold text-coral" onClick={openPreview} type="button">
          查看3D模型
        </button>
      ) : null}

      {modalOpen ? (
        <StlPreviewModal
          color={color}
          dimensions={normalizedDimensions}
          file={file}
          fileUrl={fileUrl}
          filename={filename}
          filesize={filesize}
          material={material}
          onClose={() => setModalOpen(false)}
          onDimensions={reportDimensions}
          quantity={quantity}
          quoteStatus={quoteStatus}
        />
      ) : null}
    </div>
  );
}

function StlPreviewModal({
  file,
  fileUrl,
  filename,
  filesize,
  dimensions,
  material,
  color,
  quantity,
  quoteStatus,
  onClose,
  onDimensions,
}: Required<Pick<StlModelPreviewProps, "filename" | "filesize">> &
  Pick<StlModelPreviewProps, "file" | "fileUrl" | "material" | "color" | "quantity" | "quoteStatus"> & {
    dimensions: StlDimensions | null;
    onClose: () => void;
    onDimensions: (dimensions: StlDimensions | null) => void;
  }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<StlViewerHandle | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [activeDimensions, setActiveDimensions] = useState<StlDimensions | null>(dimensions);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    setStatus("loading");

    loadStlGeometry({ file, url: fileUrl, signal: controller.signal })
      .then(async (geometry) => {
        if (disposed) {
          geometry.dispose();
          return;
        }

        const nextDimensions = readStlDimensions(geometry);
        setActiveDimensions(nextDimensions);
        onDimensions(nextDimensions);

        if (!viewerRef.current) {
          geometry.dispose();
          return;
        }

        handleRef.current?.dispose();
        handleRef.current = await createStlViewer(viewerRef.current, geometry);
        geometry.dispose();

        if (!disposed) {
          setStatus("ready");
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        console.error("STL model preview failed", error);
        if (!disposed) {
          setStatus("failed");
        }
      });

    return () => {
      disposed = true;
      controller.abort();
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [file, fileUrl, onDimensions]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4 py-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="grid max-h-[92vh] w-full max-w-5xl overflow-hidden bg-white shadow-xl md:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="flex min-h-[22rem] flex-col border-b border-ink/10 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <h2 className="text-base font-bold">3D 模型预览</h2>
            <div className="flex items-center gap-2">
              <button
                className="border border-ink/15 px-3 py-2 text-xs font-semibold text-ink"
                onClick={() => handleRef.current?.resetView()}
                type="button"
              >
                重置视角
              </button>
              <button className="bg-ink px-3 py-2 text-xs font-semibold text-white" onClick={onClose} type="button">
                关闭
              </button>
            </div>
          </div>
          <div className="relative min-h-[22rem] flex-1 bg-ash">
            <div className="absolute inset-0" ref={viewerRef} />
            {status !== "ready" ? (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-graphite">
                {status === "failed" ? "模型预览加载失败，不影响报价提交，请确认文件是否正确。" : "正在加载 3D 模型..."}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-4 overflow-y-auto p-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral">STL Preview</p>
            <h3 className="mt-2 break-all text-lg font-bold">{filename}</h3>
          </div>
          <dl className="grid gap-3">
            <InfoRow label="文件大小" value={formatBytes(filesize)} />
            <InfoRow label="XYZ 尺寸" value={formatStlDimensions(activeDimensions)} />
            <InfoRow label="材料" value={material || "-"} />
            <InfoRow label="颜色" value={color || "-"} />
            <InfoRow label="数量" value={quantity ? String(quantity) : "-"} />
            <InfoRow label="报价状态" value={quoteStatus || "-"} />
          </dl>
          {getStlDimensionNotice(activeDimensions) ? (
            <p className="border border-coral/30 bg-coral/10 px-3 py-2 text-xs font-semibold leading-5 text-coral">
              {getStlDimensionNotice(activeDimensions)}
            </p>
          ) : null}
          <p className="border border-ink/10 bg-paper px-3 py-2 text-xs leading-5 text-graphite">
            STL 文件通常不包含单位，系统默认按 mm 识别。如尺寸异常，请联系客服确认。
          </p>
        </aside>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3 border border-ink/10 bg-white px-3 py-2">
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd className="break-all font-semibold text-ink">{value}</dd>
    </div>
  );
}

function getPreviewPlaceholder(status: LoadStatus, isStl: boolean, filesize: number) {
  if (!isStl) {
    return "非 STL 文件";
  }

  if (filesize > MAX_AUTO_STL_PREVIEW_BYTES) {
    return "点击加载预览";
  }

  if (status === "loading") {
    return "正在生成缩略图";
  }

  if (status === "failed") {
    return "预览失败";
  }

  return "STL 缩略图";
}

function normalizeDimensions(dimensions: QuoteDimensions | null | undefined): StlDimensions | null {
  if (
    typeof dimensions?.x === "number" &&
    typeof dimensions.y === "number" &&
    typeof dimensions.z === "number" &&
    [dimensions.x, dimensions.y, dimensions.z].every((value) => Number.isFinite(value) && value >= 0)
  ) {
    return {
      x: dimensions.x,
      y: dimensions.y,
      z: dimensions.z,
    };
  }

  return null;
}
