export type MeetingStatus =
  | "needs-transcription"
  | "needs-summary"
  | "needs-photo-optimization"
  | "ready-to-archive"
  | "archived";

export type MeetingLocation = "upload" | "completed" | "published";

export type TranscriptChunk = {
  fileName: string;
  fileIndex?: number;
  segmentCount?: number;
  text: string;
};

export type TranscriptUploadSegment = {
  segmentIndex: number;
  fileName: string;
  sizeBytes: number;
  sha256: string;
};

export type TranscriptSourceFile = {
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  fileIndex?: number;
  uploadStrategy?: "single" | "split";
  uploadSegments?: TranscriptUploadSegment[];
};

export type TranscriptArtifact = {
  schemaVersion: 1;
  meetingId: string;
  createdAt: string;
  model: string;
  sourceFiles: TranscriptSourceFile[];
  chunks: TranscriptChunk[];
  text: string;
};

export type MeetingHighlight = {
  title: string;
  body: string;
};

export type MeetingActionItem = {
  owner: string;
  task: string;
  due?: string;
};

export type MeetingSummary = {
  schemaVersion: 1;
  meeting: {
    id: string;
    title: string;
    date?: string;
    location?: string;
    language: "zh-TW";
    generatedAt: string;
    sourceLanguages: string[];
  };
  hero: {
    kicker: string;
    headline: string;
    dek: string;
  };
  agenda: string[];
  attendees: string[];
  highlights: MeetingHighlight[];
  decisions?: string[];
  actionItems?: MeetingActionItem[];
  quotes: string[];
  closingNote: string;
};

export type PhotoManifestSourceFile = {
  fileName: string;
  sha256: string;
};

export type PhotoManifestEntry = {
  sourceFileName: string;
  outputFileName: string;
  sha256: string;
  sourceMimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type PhotoManifestArtifact = {
  schemaVersion: 1;
  meetingId: string;
  createdAt: string;
  sourceLocation: "upload" | "completed" | "published";
  sourceFiles: PhotoManifestSourceFile[];
  photos: PhotoManifestEntry[];
};

export type MeetingPhoto = {
  fileName: string;
  url: string;
  originalUrl: string;
  width?: number;
  height?: number;
};

export type MeetingListItem = {
  id: string;
  title: string;
  sourceLocation: MeetingLocation;
  status: MeetingStatus;
  audioCount: number;
  photoCount: number;
  hasTranscript: boolean;
  hasSummary: boolean;
  hasOptimizedPhotos: boolean;
  updatedAt?: string;
  kicker?: string;
  headline?: string;
  dek?: string;
  summaryGeneratedAt?: string;
  coverPhotoUrl?: string;
};

export type MeetingDetail = MeetingListItem & {
  transcript: TranscriptArtifact | null;
  summary: MeetingSummary | null;
  photos: MeetingPhoto[];
  translatedTranscriptParagraphs: string[];
  translatedTranscriptPath?: string;
  transcriptPath: string;
  summaryPath: string;
  sourceAudioPath: string;
  sourcePhotoPath: string;
  recommendedCommands: {
    status: string;
    transcribe: string;
    optimizePhotos: string;
    archive: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isTranscriptUploadSegment(value: unknown): value is TranscriptUploadSegment {
  return (
    isRecord(value) &&
    typeof value.segmentIndex === "number" &&
    typeof value.fileName === "string" &&
    typeof value.sizeBytes === "number" &&
    typeof value.sha256 === "string"
  );
}

function isTranscriptSourceFile(value: unknown): value is TranscriptSourceFile {
  return (
    isRecord(value) &&
    typeof value.fileName === "string" &&
    typeof value.filePath === "string" &&
    typeof value.mimeType === "string" &&
    typeof value.sizeBytes === "number" &&
    typeof value.sha256 === "string" &&
    (value.fileIndex === undefined || typeof value.fileIndex === "number") &&
    (value.uploadStrategy === undefined ||
      value.uploadStrategy === "single" ||
      value.uploadStrategy === "split") &&
    (value.uploadSegments === undefined ||
      (Array.isArray(value.uploadSegments) && value.uploadSegments.every(isTranscriptUploadSegment)))
  );
}

function isTranscriptChunk(value: unknown): value is TranscriptChunk {
  return (
    isRecord(value) &&
    typeof value.fileName === "string" &&
    typeof value.text === "string" &&
    (value.fileIndex === undefined || typeof value.fileIndex === "number") &&
    (value.segmentCount === undefined || typeof value.segmentCount === "number")
  );
}

export function isTranscriptArtifact(value: unknown): value is TranscriptArtifact {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    typeof value.meetingId === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.model === "string" &&
    typeof value.text === "string" &&
    Array.isArray(value.sourceFiles) &&
    value.sourceFiles.every(isTranscriptSourceFile) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isTranscriptChunk)
  );
}

export function isMeetingSummary(value: unknown): value is MeetingSummary {
  if (!isRecord(value)) {
    return false;
  }

  const meeting = value.meeting;
  const hero = value.hero;

  if (!isRecord(meeting) || !isRecord(hero)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    typeof meeting.id === "string" &&
    typeof meeting.title === "string" &&
    meeting.language === "zh-TW" &&
    typeof meeting.generatedAt === "string" &&
    isStringArray(meeting.sourceLanguages) &&
    typeof hero.kicker === "string" &&
    typeof hero.headline === "string" &&
    typeof hero.dek === "string" &&
    isStringArray(value.agenda) &&
    isStringArray(value.attendees) &&
    Array.isArray(value.highlights) &&
    value.highlights.every(
      (item) =>
        isRecord(item) && typeof item.title === "string" && typeof item.body === "string",
    ) &&
    (value.decisions === undefined || isStringArray(value.decisions)) &&
    (value.actionItems === undefined ||
      (Array.isArray(value.actionItems) &&
        value.actionItems.every(
          (item) =>
            isRecord(item) &&
            typeof item.owner === "string" &&
            typeof item.task === "string" &&
            (item.due === undefined || typeof item.due === "string"),
        ))) &&
    isStringArray(value.quotes) &&
    typeof value.closingNote === "string"
  );
}

export function isPhotoManifestArtifact(value: unknown): value is PhotoManifestArtifact {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    typeof value.meetingId === "string" &&
    typeof value.createdAt === "string" &&
    (value.sourceLocation === "upload" ||
      value.sourceLocation === "completed" ||
      value.sourceLocation === "published") &&
    Array.isArray(value.sourceFiles) &&
    value.sourceFiles.every(
      (item) =>
        isRecord(item) && typeof item.fileName === "string" && typeof item.sha256 === "string",
    ) &&
    Array.isArray(value.photos) &&
    value.photos.every(
      (item) =>
        isRecord(item) &&
        typeof item.sourceFileName === "string" &&
        typeof item.outputFileName === "string" &&
        typeof item.sha256 === "string" &&
        typeof item.sourceMimeType === "string" &&
        typeof item.width === "number" &&
        typeof item.height === "number" &&
        typeof item.sizeBytes === "number",
    )
  );
}
