import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const modelDirectory = "public/models/cronformer";

describe("Cronformer model artifact", () => {
  it("matches the revision-pinned manifest", () => {
    const manifest = JSON.parse(
      readFileSync(`${modelDirectory}/manifest.json`, "utf8"),
    ) as { exportedModelSha256: string; revision: string; source: string };
    const sha256 = createHash("sha256")
      .update(readFileSync(`${modelDirectory}/model.onnx`))
      .digest("hex");

    expect(manifest.source).toBe(
      "https://huggingface.co/uncommonstash/cronformer",
    );
    expect(manifest.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(sha256).toBe(manifest.exportedModelSha256);
  });
});
