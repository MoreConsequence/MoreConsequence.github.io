const safeRouteSegment = /^[A-Za-z0-9._~-]+$/;

export function encodeRouteSegment(value: string) {
  if (safeRouteSegment.test(value) && !value.startsWith("x-")) {
    return value;
  }

  return `x-${encodeURIComponent(value)
    .replaceAll("~", "~~")
    .replaceAll("%", "~")}`;
}

export function decodeRouteSegment(value: string) {
  if (!value.startsWith("x-")) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  const encoded = value
    .slice(2)
    .replaceAll("~~", "\u0000")
    .replace(/~([0-9A-Fa-f]{2})/g, "%$1")
    .replaceAll("\u0000", "~");

  try {
    return decodeURIComponent(encoded);
  } catch {
    return value;
  }
}

export function tagHref(tag: string) {
  return `/tags/${encodeRouteSegment(tag)}/`;
}

export function seriesHref(series: string) {
  return `/series/${encodeRouteSegment(series)}/`;
}
