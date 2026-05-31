export type MeetingStatus =
  | "needs-transcription"
  | "needs-summary"
  | "ready-to-archive"
  | "archived";

export type MeetingLocation = "upload" | "completed";

export type TranscriptChunk = {
  fileName: string;
  text: string;
};

export type TranscriptSourceFile = {
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
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
  decisions: string[];
  actionItems: MeetingActionItem[];
  quotes: string[];
  closingNote: string;
};

export type MeetingPhoto = {
  fileName: string;
  url: string;
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
  transcriptPath: string;
  summaryPath: string;
  sourceAudioPath: string;
  sourcePhotoPath: string;
  recommendedCommands: {
    status: string;
    transcribe: string;
    archive: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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
    Array.isArray(value.chunks)
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
    isStringArray(value.decisions) &&
    Array.isArray(value.actionItems) &&
    value.actionItems.every(
      (item) =>
        isRecord(item) &&
        typeof item.owner === "string" &&
        typeof item.task === "string" &&
        (item.due === undefined || typeof item.due === "string"),
    ) &&
    isStringArray(value.quotes) &&
    typeof value.closingNote === "string"
  );
}
