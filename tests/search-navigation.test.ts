import { describe, expect, it } from "vitest";
import { getNextSearchSelection } from "@/components/search/search-navigation";

describe("search keyboard navigation", () => {
  it("wraps through results with the arrow keys", () => {
    expect(getNextSearchSelection(-1, "ArrowDown", 3)).toBe(0);
    expect(getNextSearchSelection(2, "ArrowDown", 3)).toBe(0);
    expect(getNextSearchSelection(0, "ArrowUp", 3)).toBe(2);
  });

  it("does not select a result when the list is empty", () => {
    expect(getNextSearchSelection(0, "ArrowDown", 0)).toBe(-1);
  });
});
