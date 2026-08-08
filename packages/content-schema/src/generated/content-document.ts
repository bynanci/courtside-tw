/* Generated from contracts/content-document.schema.json. Do not edit by hand. */

export type Uuid = string

export type Slug = string

export type SecureHref = string

export interface InlineTextRun {
  kind: "text"
  text: string
}

export interface InlineLinkRun {
  kind: "link"
  text: string
  href: SecureHref
}

export type InlineContent = [InlineTextRun | InlineLinkRun, ...Array<InlineTextRun | InlineLinkRun>]

export interface ParagraphPayload {
  content: InlineContent
}

export interface HeadingPayload {
  level: number
  text: string
}

export interface ListItem {
  content: InlineContent
}

export interface ListPayload {
  ordered: boolean
  items: [ListItem, ...Array<ListItem>]
}

export interface QuotePayload {
  content: InlineContent
  attribution?: string
}

export interface DividerPayload {
  style?: "solid" | "space"
}

export interface ImagePayload {
  assetId: Uuid
  altText: string
  variant?: "hero" | "wide" | "inline" | "card"
  caption?: string
  credit?: string
}

export interface GalleryItem {
  assetId: Uuid
  altText: string
  caption?: string
  credit?: string
}

export interface GalleryPayload {
  layout?: "grid" | "stack"
  items: [GalleryItem, GalleryItem, ...Array<GalleryItem>]
}

export interface StatPayload {
  label: string
  value: string
  unit: string
  context: string
}

export interface VideoPayload {
  providerId: "rights-pending"
  videoId: string
  title: string
  caption?: string
}

export interface RelatedReadingPayload {
  articleSlug: Slug
  label: string
}

export interface GenerativeCanvasPayload {
  presetId: "court-pulse-v1"
  seed: number
  parameters: {
    density: number
    tempo: number
    lineWeight: number
    paletteId: "court-dusk"
    numericSequence: Array<number>
  }
  posterAssetId: Uuid
  altText: string
  dataSummary: string
}

export interface ParagraphBlock {
  id: Uuid
  type: "paragraph"
  version: 1
  payload: ParagraphPayload
}

export interface HeadingBlock {
  id: Uuid
  type: "heading"
  version: 1
  payload: HeadingPayload
}

export interface ListBlock {
  id: Uuid
  type: "list"
  version: 1
  payload: ListPayload
}

export interface QuoteBlock {
  id: Uuid
  type: "quote"
  version: 1
  payload: QuotePayload
}

export interface DividerBlock {
  id: Uuid
  type: "divider"
  version: 1
  payload: DividerPayload
}

export interface ImageBlock {
  id: Uuid
  type: "image"
  version: 1
  payload: ImagePayload
}

export interface GalleryBlock {
  id: Uuid
  type: "gallery"
  version: 1
  payload: GalleryPayload
}

export interface StatBlock {
  id: Uuid
  type: "stat"
  version: 1
  payload: StatPayload
}

export interface VideoBlock {
  id: Uuid
  type: "video"
  version: 1
  payload: VideoPayload
}

export interface RelatedReadingBlock {
  id: Uuid
  type: "related-reading"
  version: 1
  payload: RelatedReadingPayload
}

export interface GenerativeCanvasBlock {
  id: Uuid
  type: "generative-canvas"
  version: 1
  payload: GenerativeCanvasPayload
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | DividerBlock
  | ImageBlock
  | GalleryBlock
  | StatBlock
  | VideoBlock
  | RelatedReadingBlock
  | GenerativeCanvasBlock

export interface ContentDocument {
  schemaVersion: 1
  documentId: Uuid
  blocks: [Block, ...Array<Block>]
}
