import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPostDocument,
  formatLocalDate,
  slugifyTitle,
  writeNewPost,
} from "@/scripts/new-post.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("new post command", () => {
  it("creates readable slugs for mixed Chinese and English titles", () => {
    expect(slugifyTitle("理解 Go Context 的边界")).toBe(
      "理解-go-context-的边界",
    );
  });

  it("creates complete draft frontmatter", () => {
    const document = createPostDocument("理解事件循环", "2026-07-26");

    expect(document).toContain('title: "理解事件循环"');
    expect(document).toContain('publishedAt: "2026-07-26"');
    expect(document).toContain("draft: true");
    expect(document).toContain('description: "请在这里填写一句话摘要"');
  });

  it("uses the author's local calendar date around UTC midnight", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";

    try {
      expect(formatLocalDate(new Date("2026-07-25T16:30:00.000Z"))).toBe(
        "2026-07-26",
      );
    } finally {
      process.env.TZ = previousTimezone;
    }
  });

  it("writes once and refuses to overwrite an existing article", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "haoyu-post-"));
    temporaryDirectories.push(root);

    const firstPath = await writeNewPost({
      root,
      title: "第一篇文章",
      date: "2026-07-26",
    });
    const saved = await readFile(firstPath, "utf8");

    expect(saved).toContain('title: "第一篇文章"');
    await expect(
      writeNewPost({ root, title: "第一篇文章", date: "2026-07-26" }),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });
});
