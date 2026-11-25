export * from "./schema.ts";
export * from "./presets.ts";
export { buildPayload, escapeText, escapeWifi, foldLine } from "./payload.ts";
export { renderSvg, effectiveEcc, matrixSize } from "./render.ts";
export { verify } from "./verify.ts";
export type { Rasterizer, Pixels, VerifyResult } from "./verify.ts";
export { addCampaignTags, applyCampaign, campaignSchema } from "./tracking.ts";
export type { Campaign } from "./tracking.ts";
export {
  browserRasterizer,
  dataUriToSafeDataUri,
  decodeBitmapDataUri,
  fileToDataUri,
  imageSize,
  MAX_SIDE,
  MAX_PIXELS,
  HEADER_BYTES,
} from "./browserRaster.ts";
export { CAMPAIGN_PRESETS, TYPE_META, contentToForm, emptyValues, formToContent } from "./forms.ts";
export type { Field, TypeMeta, Values } from "./forms.ts";
export { MAX_IMPORT_BYTES, canDownload, importTooLarge, vcardImportNotice } from "./rules.ts";
export { vcardFile } from "./vcf.ts";
export { decodeQrFromImageFile } from "./decodeImage.ts";
export type { ImageDecodeResult } from "./decodeImage.ts";
export { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, buildZip, crc32, validateZipLimits } from "./batchZip.ts";
export type { ZipEntry } from "./batchZip.ts";
export {
  MAX_FILE_BYTES,
  MAX_LINKS,
  RULE_FORMATS,
  checkBase,
  checkDestination,
  checkSlug,
  csvCell,
  makeUniqueSlug,
  netlifySafe,
  normalizeOwnedBaseOnBlur,
  normalizeRawDomainUrl,
  parseLinksCsv,
  parseLinksFile,
  parseTwoColumnLinks,
  ruleNotes,
  rulesOf,
  serverSafe,
  suggestSlug,
  vercelSafe,
  writeHtmlFiles,
  writeLinksCsv,
  writeLinksJson,
  writeRules,
} from "./redirects.ts";
export type { FormatInfo, HtmlRedirectFile, LinkRow, LinksFile, Rule, RuleFormat } from "./redirects.ts";
export {
  classifyQrPayload,
  hostMatchesOwned,
  normalizeDomain,
  parseOwnedDomains,
  parseOwnedDomainsDetailed,
} from "./lockin.ts";
export type { LockinStatus, LockinVerdict } from "./lockin.ts";
export {
  escapeSummary,
  escapeToLinks,
  makeItemId,
  parseBulkEscapePaste,
  parseEscapeCsv,
  parseEscapeJson,
  sortEscapeItems,
  writeEscapeCsv,
  writeEscapeJson,
  writeReprintCsv,
} from "./migration.ts";
export type { EscapeCsvOptions, EscapeItem, EscapePlan, EscapePriority, EscapeStatus, EscapeSummary } from "./migration.ts";
export { printGuide } from "./printSize.ts";
export type { PrintGuide } from "./printSize.ts";
export {
  INLINE_LOADER_SOURCE,
  LOADER_ID_PATTERN,
  buildCodesJsonLoaderSource,
  isSafeFallback,
  isSafeTargetUrl,
  isSamePageUrl,
  normalizePathname,
  normalizeSameOriginJsonPath,
  resolveBanditCode,
} from "./snippetLoader.ts";
export type { BanditCodeEntry, BanditCodesConfig, ResolveOutcome } from "./snippetLoader.ts";
export {
  SNIPPET_ID_PATTERN,
  SNIPPET_PARAM_PATTERN,
  checkSnippetPageUrl,
  cleanManifestCell,
  diffSnippetBaseline,
  isPlaceholderPageHost,
  makeSnippetUid,
  parseSnippetBulkPaste,
  parseSnippetOrJson,
  rowsToBanditConfig,
  sanitizeSavedSnippetRows,
  snippetQrUrl,
  suggestSnippetId,
  validateSnippetState,
  writeCodesJson,
  writeCodesJsonSnippet,
  writeInlineSnippet,
} from "./snippet.ts";
export type {
  SnippetBaseline,
  SnippetDiff,
  SnippetRow,
  SnippetRowIssue,
  SnippetValidation,
} from "./snippet.ts";
export {
  MAX_BATCH_QUIET_ZONE,
  MAX_BATCH_ZIP_BYTES,
  MIN_BATCH_QUIET_ZONE,
  batchStyleFromPreset,
  batchStyleMissingImageReason,
  batchStyleToConfig,
  checkBatchZipSize,
  clampBatchQuietZone,
  cloneBatchStyle,
  defaultBatchStyle,
  describeBatchStyle,
  estimateBatchZipBytes,
  matchingPresetName,
  renderBatchQrSvg,
  verifyBatchQrCodes,
} from "./batchStyle.ts";
export type { BatchQrImage, BatchQrItem, BatchQrStyle, BatchVerifyResult } from "./batchStyle.ts";
export { GUIDED_GOALS, GUIDED_HOSTS, getGuidedPlan } from "./guided.ts";
export type { GuidedGoal, GuidedGoalOption, GuidedHost, GuidedHostOption, GuidedPlan, GuidedStep, StudioTabId } from "./guided.ts";
