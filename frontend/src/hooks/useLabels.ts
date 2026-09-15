/** Minimal labels hook. v1 ships with copy inline in components (small app,
 * single locale); this stub exists so externalizing strings later is a
 * non-breaking change rather than a refactor, per the blueprint's
 * labels.properties convention. */
export function useLabels() {
  return {
    l: (key: string, fallback: string) => fallback,
  }
}
