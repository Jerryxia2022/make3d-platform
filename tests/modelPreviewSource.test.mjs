import { test } from "node:test";
import assert from "node:assert/strict";

import { buildModelPreviewSource } from "../src/frontend/lib/model-preview-source.ts";

test("selected browser file remains the stable preview source after a draft URL appears", () => {
  const file = { name: "fixture.stl", size: 100 };
  const source = buildModelPreviewSource({
    file,
    modelFileUrl: "/api/quote/draft/files/12/download",
  });
  assert.equal(source.file, file);
  assert.equal(source.url, undefined);
});

test("restored previews use model URLs and reject G-code paths", () => {
  assert.deepEqual(
    buildModelPreviewSource({ modelFileUrl: "/api/quote/draft/files/12/download?artifact=preview" }),
    { url: "/api/quote/draft/files/12/download?artifact=preview", signal: undefined },
  );
  assert.throws(
    () => buildModelPreviewSource({ modelFileUrl: "/results/gcode/output.gcode" }),
    /G-code cannot be used/,
  );
});
