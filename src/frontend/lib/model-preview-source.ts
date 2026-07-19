export type ModelPreviewSource = {
  file?: File;
  url?: string;
  signal?: AbortSignal;
};

export function buildModelPreviewSource(input: {
  file?: File;
  modelFileUrl?: string;
  signal?: AbortSignal;
}): ModelPreviewSource {
  if (input.file) {
    return { file: input.file, signal: input.signal };
  }
  if (!input.modelFileUrl) {
    return { signal: input.signal };
  }

  const path = input.modelFileUrl.split(/[?#]/, 1)[0].toLowerCase();
  if (path.endsWith(".gcode") || path.includes("/gcode/")) {
    throw new Error("G-code cannot be used as a model preview source");
  }
  return { url: input.modelFileUrl, signal: input.signal };
}
