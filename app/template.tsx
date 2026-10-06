// Re-mounts on every navigation, so each page fades up into place instead of
// snapping in. The animation (and its reduced-motion fallback) is in globals.css.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="routeFade">{children}</div>;
}
