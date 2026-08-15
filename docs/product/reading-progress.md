# Reader library and reading-progress contract

## Scope

Signed-in readers may synchronize bookmarks and revision-aware reading progress. Anonymous reading stays available and keeps using bounded local storage; login is never required to read public content.

## Stable identity and anchors

- A bookmark is unique by `(reader, articleId)`. Repeating `PUT` or `DELETE` has the same outcome as applying it once.
- Progress is unique by `(reader, articleId)` and carries the current published `revisionId`, a block `blockId`, a percentage from 0 through 100, and `updatedAt`.
- The server accepts an anchor only when the article is currently `PUBLISHED`, the revision is its current published revision, and the block still exists in that revision.
- Stale revisions, missing blocks, withdrawn articles, non-finite percentages, and timestamps more than five minutes in the future fail closed. A withdrawn bookmark may remain visible as unavailable, but neither its body nor a public slug is returned.

## Explicit merge

Merge is a two-step operation:

1. `preview` validates at most 100 local records, chooses the newer valid candidate for each article, and performs no write.
2. `apply` repeats the same validation and writes only a local candidate whose timestamp is newer than the current server row.

The server value wins ties. An invalid local anchor never replaces a valid server value. If neither side is valid, the operation reports a conflict. Database conflict handling preserves this rule when two devices apply concurrently.

The browser stores one canonical timestamped record per article. Legacy or untimestamped records may still restore local reading, but are not sent into a server merge until a new canonical save exists. The `/library` UI never applies a preview automatically; the reader must press the confirmation control.

## Session and lifecycle behavior

- Logout or session expiry stops bookmark/progress synchronization without deleting local reading progress or making the public article unavailable.
- A revision change invalidates the old local position instead of scrolling to a possibly different block.
- Account export contains only the current reader identity key, bookmarks, progress, and generation time. It never includes credentials or bearer tokens.
- Account deletion requires explicit confirmation, a bounded idempotency key, and OIDC authentication no older than ten minutes. Completed erasure removes bookmarks and progress, revokes active roles, pseudonymizes the profile, and stores only a one-way identity digest in the immutable erasure receipt.
- Browser-owned local progress keys are removed only after the server reports completed erasure; unrelated local-storage entries are preserved.

## Executable evidence

- Spring/PostgreSQL contract: `ReaderLibraryApiIT`
- Pure merge properties: `ProgressMergePolicyTest`
- Local-storage unit contract: `useLocalReadingProgress.test.ts`
- BFF allowlist contract: `reader-library-bff.test.ts`
- Browser journeys: `us5-reader-library.spec.ts` and `us5-account-deletion.spec.ts`
