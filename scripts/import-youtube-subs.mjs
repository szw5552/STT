#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertSafeSegment,
  ensurePipelineDirectories,
  getMeetingDirectories,
  readJsonIfExists,
  writeJson,
} from "./lib/meeting-paths.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_LANGUAGE_PRIORITY = ["zh-TW", "zh-Hant", "zh-Hans", "zh", "en"];
const SUPPORTED_SUBTITLE_FORMATS = ["vtt", "json3"];

function printUsage() {
  console.error(
    [
      "用法：",
      "  npm run import-youtube-subs -- <youtube-url> [--lang zh-TW,zh-Hant,zh,en]",
      "  npm run import-youtube-subs -- <meeting-id> <youtube-url> [--lang zh-TW,zh-Hant,zh,en]",
    ].join("\n"),
  );
}

function isTranscriptArtifact(value) {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray(value.sourceFiles) &&
    typeof value.text === "string"
  );
}

function normalizeLanguagePriority(rawValue) {
  if (rawValue == null) {
    return DEFAULT_LANGUAGE_PRIORITY;
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const positional = [];
  let rawLanguagePriority = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--lang") {
      rawLanguagePriority = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`不支援的參數：${arg}`);
    }

    positional.push(arg);
  }

  if (
    rawLanguagePriority !== null &&
    normalizeLanguagePriority(rawLanguagePriority).length === 0
  ) {
    throw new Error("--lang 至少要提供一個語言代碼。");
  }

  if (positional.length === 1) {
    return {
      meetingId: null,
      url: positional[0],
      languagePriority: normalizeLanguagePriority(rawLanguagePriority),
    };
  }

  if (positional.length === 2) {
    return {
      meetingId: assertSafeSegment(positional[0], "meetingId"),
      url: positional[1],
      languagePriority: normalizeLanguagePriority(rawLanguagePriority),
    };
  }

  printUsage();
  throw new Error("參數數量不正確。");
}

async function ensureYtDlpAvailable() {
  try {
    await execFileAsync("yt-dlp", ["--version"]);
  } catch {
    throw new Error("找不到 yt-dlp，請先在本機安裝後再執行。");
  }
}

async function getVideoMetadata(url) {
  const { stdout } = await execFileAsync("yt-dlp", ["--dump-single-json", "--skip-download", url], {
    maxBuffer: 32 * 1024 * 1024,
  });

  const metadata = JSON.parse(stdout);

  if (
    !metadata ||
    typeof metadata !== "object" ||
    typeof metadata.id !== "string" ||
    typeof metadata.webpage_url !== "string"
  ) {
    throw new Error("yt-dlp metadata 缺少必要欄位，無法匯入字幕。");
  }

  return metadata;
}

function buildLanguageVariants(language) {
  const variants = new Set([language]);
  const lowerCase = language.toLowerCase();
  variants.add(lowerCase);

  const normalized = lowerCase.replace("_", "-");
  variants.add(normalized);

  if (normalized.includes("-")) {
    variants.add(normalized.split("-")[0]);
  }

  return [...variants];
}

function selectPreferredSubtitleEntry(entries) {
  for (const format of SUPPORTED_SUBTITLE_FORMATS) {
    const match = entries.find((entry) => entry && typeof entry === "object" && entry.ext === format);
    if (match) {
      return match;
    }
  }

  return null;
}

function findTrackByLanguage(trackMap, language) {
  if (!trackMap || typeof trackMap !== "object") {
    return null;
  }

  const keys = Object.keys(trackMap);
  const exactMatch = keys.find((key) => buildLanguageVariants(language).includes(key.toLowerCase()));

  if (exactMatch) {
    const entry = selectPreferredSubtitleEntry(trackMap[exactMatch]);
    if (entry) {
      return { language: exactMatch, entry };
    }
  }

  const baseLanguage = language.toLowerCase();
  const prefixMatch = keys.find((key) => key.toLowerCase().startsWith(`${baseLanguage}-`));

  if (!prefixMatch) {
    return null;
  }

  const entry = selectPreferredSubtitleEntry(trackMap[prefixMatch]);
  return entry ? { language: prefixMatch, entry } : null;
}

function listAvailableLanguages(trackMap) {
  if (!trackMap || typeof trackMap !== "object") {
    return [];
  }

  return Object.entries(trackMap)
    .filter(([, entries]) => Boolean(selectPreferredSubtitleEntry(entries)))
    .map(([language]) => language)
    .sort((left, right) => left.localeCompare(right));
}

function buildSubtitleCandidates(metadata, languagePriority) {
  const candidates = [];
  const seen = new Set();

  for (const language of languagePriority) {
    const subtitleTrack = findTrackByLanguage(metadata.subtitles, language);
    if (subtitleTrack) {
      const key = `subtitles:${subtitleTrack.language}:${subtitleTrack.entry.ext}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          sourceType: "subtitles",
          language: subtitleTrack.language,
          entry: subtitleTrack.entry,
        });
      }
    }

    const automaticTrack = findTrackByLanguage(metadata.automatic_captions, language);
    if (automaticTrack) {
      const key = `automatic_captions:${automaticTrack.language}:${automaticTrack.entry.ext}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          sourceType: "automatic_captions",
          language: automaticTrack.language,
          entry: automaticTrack.entry,
        });
      }
    }
  }

  return candidates;
}

function getSubtitleCandidates(metadata, languagePriority) {
  const candidates = buildSubtitleCandidates(metadata, languagePriority);

  if (candidates.length > 0) {
    return candidates;
  }

  const availableManualLanguages = listAvailableLanguages(metadata.subtitles);
  const availableAutomaticLanguages = listAvailableLanguages(metadata.automatic_captions);

  const manualPreview =
    availableManualLanguages.length > 0
      ? availableManualLanguages.slice(0, 12).join(", ")
      : "無";
  const automaticPreview =
    availableAutomaticLanguages.length > 0
      ? availableAutomaticLanguages.slice(0, 12).join(", ")
      : "無";

  throw new Error(
    [
      `找不到符合語言優先序 ${languagePriority.join(", ")} 的字幕。`,
      `可用字幕：${manualPreview}`,
      `可用自動字幕：${automaticPreview}`,
    ].join(" "),
  );
}

async function downloadBestAvailableSubtitle(url, metadata, languagePriority) {
  const candidates = getSubtitleCandidates(metadata, languagePriority);
  const errors = [];

  for (const candidate of candidates) {
    try {
      const result = await downloadSubtitleFile(url, candidate, metadata.id);
      return { ...result, subtitleTrack: candidate };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${candidate.language} (${candidate.sourceType}): ${message}`);
    }
  }

  throw new Error(
    `找到了符合條件的字幕語言，但全部下載失敗：${errors.join(" | ")}`,
  );
}

function decodeHtmlEntities(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    const namedEntities = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"',
    };

    if (entity in namedEntities) {
      return namedEntities[entity];
    }

    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }

    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }

    return match;
  });
}

function normalizeCueText(value) {
  return decodeHtmlEntities(value)
    .replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, " ")
    .replace(/<\/?c(?:\.[^>]*)?>/g, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVttCueTexts(rawSubtitle) {
  return rawSubtitle
    .split(/\r?\n\r?\n+/)
    .map((block) => block.split(/\r?\n/).map((line) => line.trim()))
    .filter((lines) => lines.some((line) => line.includes("-->")))
    .map((lines) => {
      const cueIndex = lines.findIndex((line) => line.includes("-->"));
      return lines.slice(cueIndex + 1).join(" ");
    });
}

function extractJson3CueTexts(rawSubtitle) {
  const subtitle = JSON.parse(rawSubtitle);

  if (!subtitle || typeof subtitle !== "object" || !Array.isArray(subtitle.events)) {
    throw new Error("json3 字幕格式不正確。");
  }

  return subtitle.events
    .filter((event) => event && typeof event === "object" && Array.isArray(event.segs))
    .map((event) =>
      event.segs
        .map((segment) =>
          segment && typeof segment === "object" && typeof segment.utf8 === "string"
            ? segment.utf8
            : "",
        )
        .join(""),
    );
}

function findOverlapLength(previous, current) {
  const maxLength = Math.min(previous.length, current.length);

  for (let length = maxLength; length >= 12; length -= 1) {
    if (previous.slice(-length) === current.slice(0, length)) {
      return length;
    }
  }

  return 0;
}

function mergeRollingCaptions(lines) {
  const merged = [];

  for (const rawLine of lines) {
    const line = normalizeCueText(rawLine);

    if (!line) {
      continue;
    }

    if (merged.length === 0) {
      merged.push(line);
      continue;
    }

    const previous = merged[merged.length - 1];

    if (line === previous || previous.startsWith(line)) {
      continue;
    }

    if (line.startsWith(previous)) {
      merged[merged.length - 1] = line;
      continue;
    }

    const overlapLength = findOverlapLength(previous, line);

    if (overlapLength > 0) {
      merged[merged.length - 1] = `${previous}${line.slice(overlapLength)}`;
      continue;
    }

    merged.push(line);
  }

  return merged;
}

function subtitleTextToTranscript(rawSubtitle, subtitleFormat) {
  const cueTexts =
    subtitleFormat === "vtt" ? extractVttCueTexts(rawSubtitle) : extractJson3CueTexts(rawSubtitle);
  const mergedCaptions = mergeRollingCaptions(cueTexts);

  if (mergedCaptions.length === 0) {
    throw new Error("字幕內容為空，無法產生 transcript.json。");
  }

  return mergedCaptions.join("\n");
}

function buildCaptionFileName(videoId, language, extension) {
  const safeLanguage = language.replace(/[^\w.-]+/g, "-");
  return `${videoId}.${safeLanguage}.${extension}`;
}

function getMimeTypeForSubtitleFormat(subtitleFormat) {
  return subtitleFormat === "vtt" ? "text/vtt" : "application/json";
}

async function downloadSubtitleFile(url, subtitleTrack, videoId) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-dlp-subs-"));

  try {
    const args = [
      "--skip-download",
      "--sub-langs",
      subtitleTrack.language,
      "--sub-format",
      subtitleTrack.entry.ext,
      "--output",
      path.join(tempDir, "%(id)s.%(ext)s"),
      subtitleTrack.sourceType === "subtitles" ? "--write-subs" : "--write-auto-subs",
      url,
    ];

    await execFileAsync("yt-dlp", args, {
      maxBuffer: 16 * 1024 * 1024,
    });

    const files = await fs.readdir(tempDir);
    const expectedSuffix = `.${subtitleTrack.language}.${subtitleTrack.entry.ext}`;
    const subtitleFileName =
      files.find((fileName) => fileName.endsWith(expectedSuffix)) ??
      files.find((fileName) => fileName.startsWith(`${videoId}.`) && fileName.endsWith(`.${subtitleTrack.entry.ext}`));

    if (!subtitleFileName) {
      throw new Error("yt-dlp 沒有產生字幕檔。");
    }

    const subtitlePath = path.join(tempDir, subtitleFileName);
    const rawSubtitle = await fs.readFile(subtitlePath, "utf8");

    return {
      rawSubtitle,
      subtitleFileName,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function importYoutubeSubtitles({ url, meetingId: requestedMeetingId, languagePriority }) {
  await ensureYtDlpAvailable();
  const metadata = await getVideoMetadata(url);
  const meetingId = requestedMeetingId ?? assertSafeSegment(metadata.id, "meetingId");
  const { rawSubtitle, subtitleTrack } = await downloadBestAvailableSubtitle(
    url,
    metadata,
    languagePriority,
  );
  const transcriptText = subtitleTextToTranscript(rawSubtitle, subtitleTrack.entry.ext);
  const directories = getMeetingDirectories(meetingId);
  const captionsDir = path.join(directories.artifactDir, "captions");
  const captionFileName = buildCaptionFileName(
    metadata.id,
    subtitleTrack.language,
    subtitleTrack.entry.ext,
  );
  const captionFilePath = path.join(captionsDir, captionFileName);
  const captionBuffer = Buffer.from(rawSubtitle, "utf8");
  const captionSha256 = createHash("sha256").update(captionBuffer).digest("hex");
  const existingTranscript = await readJsonIfExists(directories.transcriptPath);

  await fs.rm(captionsDir, { recursive: true, force: true });
  await fs.mkdir(captionsDir, { recursive: true });
  await fs.writeFile(captionFilePath, captionBuffer);

  if (
    isTranscriptArtifact(existingTranscript) &&
    existingTranscript.sourceFiles.length === 1 &&
    existingTranscript.sourceFiles[0]?.fileName === captionFileName &&
    existingTranscript.sourceFiles[0]?.sha256 === captionSha256
  ) {
    console.log(`- ${meetingId}: 字幕未變更，沿用既有 transcript.json`);
    return;
  }

  await writeJson(directories.transcriptPath, {
    schemaVersion: 1,
    meetingId,
    createdAt: new Date().toISOString(),
    model: `yt-dlp:${subtitleTrack.sourceType}:${subtitleTrack.entry.ext}`,
    sourceFiles: [
      {
        fileName: captionFileName,
        filePath: captionFilePath,
        mimeType: getMimeTypeForSubtitleFormat(subtitleTrack.entry.ext),
        sizeBytes: captionBuffer.byteLength,
        sha256: captionSha256,
        fileIndex: 0,
      },
    ],
    chunks: [
      {
        fileName: captionFileName,
        fileIndex: 0,
        text: transcriptText,
      },
    ],
    text: transcriptText,
    youtube: {
      videoId: metadata.id,
      url: metadata.webpage_url,
      title: typeof metadata.title === "string" ? metadata.title : metadata.id,
      subtitleLanguage: subtitleTrack.language,
      subtitleSource: subtitleTrack.sourceType,
    },
  });

  console.log(
    `- ${meetingId}: 已從 YouTube ${subtitleTrack.sourceType === "subtitles" ? "字幕" : "自動字幕"} 匯入 ${subtitleTrack.language}，寫入 artifacts/${meetingId}/transcript.json`,
  );
}

async function main() {
  await ensurePipelineDirectories();
  const args = parseArgs(process.argv.slice(2));
  await importYoutubeSubtitles(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
