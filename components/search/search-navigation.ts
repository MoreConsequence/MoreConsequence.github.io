export function getNextSearchSelection(
  currentIndex: number,
  key: "ArrowDown" | "ArrowUp",
  resultCount: number,
) {
  if (resultCount === 0) return -1;

  if (key === "ArrowDown") {
    return (currentIndex + 1 + resultCount) % resultCount;
  }

  return (currentIndex - 1 + resultCount) % resultCount;
}
