import { describe, expect, it } from "vitest";
import { generateStaticParams } from "@/app/series/[series]/page";
import { decodeRouteSegment, encodeRouteSegment } from "@/lib/site-links";

describe("series static routes", () => {
  it("includes a known series in generated params", async () => {
    const params = await generateStaticParams();

    const slug = encodeRouteSegment("Go 的设计边界");
    expect(params).toContainEqual({ series: slug });
    expect(decodeRouteSegment(slug)).toBe("Go 的设计边界");
  });
});
