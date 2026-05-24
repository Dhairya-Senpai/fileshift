/**
 * Stub adapter used for categories we haven't wired up yet (archive, ebook).
 * Returns an adapter that immediately fails with a clear, actionable message
 * instead of silently hanging or giving a generic 500.
 */
export function unsupportedAdapter(categoryName) {
  return {
    name: `unsupported-${categoryName}`,
    async convert() {
      throw new Error(
        `${categoryName} conversions aren't supported yet (planned for Phase 2.5).`,
      );
    },
  };
}
