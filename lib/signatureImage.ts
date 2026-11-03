// Signatures are saved as drawn strokes ({ strokes: {x, y}[][] }) in a JSON file.
/** Turns a saved signature file ({ strokes: {x, y}[][] }) into an SVG image link. */
export async function signatureImage(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const body = (await (await fetch(url)).json()) as {
      strokes?: { x: number; y: number }[][];
    };
    const strokes = (body.strokes || []).filter((s) => s.length > 0);
    const points = strokes.flat();
    if (!points.length) return undefined;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const pad = 12;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const width = Math.max(Math.max(...xs) - minX + pad, 40);
    const height = Math.max(Math.max(...ys) - minY + pad, 40);
    const paths = strokes
      .map((s) =>
        s.length === 1
          ? `<circle cx="${s[0].x}" cy="${s[0].y}" r="1.6" fill="#00e5ff"/>`
          : `<polyline points="${s.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="#00e5ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width * 2}" height="${height * 2}">${paths}</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return undefined;
  }
}
