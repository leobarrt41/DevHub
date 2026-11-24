import type { Folder } from "./types";

export interface SseFrame {
  event: string;
  data: string;
}

export interface ParsedSseFrames {
  frames: SseFrame[];
  remainder: string;
}

const API_PREFIX = "/api/v1";

/** Return same-app folder IDs that cannot create a cycle when reparenting folderId. */
export function eligibleReparentFolderIds(
  folderId: string,
  folders: readonly Pick<Folder, "folder_id" | "app_id" | "parent_folder_id">[],
): string[] {
  const source = folders.find((folder) => folder.folder_id === folderId);
  if (!source) {
    return [];
  }

  const descendants = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.app_id === source.app_id && folder.parent_folder_id &&
        descendants.has(folder.parent_folder_id) && !descendants.has(folder.folder_id)) {
        descendants.add(folder.folder_id);
        changed = true;
      }
    }
  }

  return folders
    .filter((folder) => folder.app_id === source.app_id && !descendants.has(folder.folder_id))
    .map((folder) => folder.folder_id);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

/** Validate and normalize a backend origin. Credentials and URL parameters are never accepted. */
export function validateBackendUrl(input: string): string {
  const candidate = input.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("URL do backend inválida.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Use HTTPS para o backend remoto.");
  }
  if (url.username || url.password) {
    throw new Error("A URL do backend não pode conter credenciais.");
  }
  if (/[?#]/.test(candidate) || url.search || url.hash) {
    throw new Error("A URL do backend não pode conter query ou fragmento.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Informe somente a origem do backend, sem caminho.");
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new Error("HTTP só é permitido para localhost ou loopback; use HTTPS no backend remoto.");
  }
  if (!url.hostname) {
    throw new Error("A URL do backend precisa conter um host.");
  }

  return url.origin;
}

/** Build an API URL only for the documented API prefix; rejects URL/query/path injection. */
export function buildApiUrl(backendUrl: string, endpoint: string): string {
  const origin = validateBackendUrl(backendUrl);
  if (!endpoint.startsWith(`${API_PREFIX}/`) && endpoint !== API_PREFIX) {
    throw new Error("Caminho fora do prefixo /api/v1.");
  }
  if (/[?#\\\r\n]/.test(endpoint)) {
    throw new Error("Caminho de API inválido.");
  }
  const segments = endpoint.split("/");
  for (const segment of segments) {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error("Caminho de API inválido.");
    }
    if (decoded === "." || decoded === "..") {
      throw new Error("Caminho de API inválido.");
    }
  }

  const url = new URL(endpoint, origin);
  if (url.origin !== origin || url.search || url.hash) {
    throw new Error("Caminho de API inválido.");
  }
  return url.toString();
}

/** Parse all complete SSE frames in a text buffer, retaining an incomplete trailing frame. */
export function parseSseFrames(input: string, endOfStream = false): ParsedSseFrames {
  const frames: SseFrame[] = [];
  let remainder = input;

  while (true) {
    const boundary = /\r?\n\r?\n/.exec(remainder);
    if (!boundary || boundary.index === undefined) {
      break;
    }
    const frameText = remainder.slice(0, boundary.index);
    remainder = remainder.slice(boundary.index + boundary[0].length);
    const frame = parseSseFrame(frameText);
    if (frame) {
      frames.push(frame);
    }
  }

  if (endOfStream && remainder.length > 0) {
    const frame = parseSseFrame(remainder.replace(/\r?\n$/, ""));
    if (frame) {
      frames.push(frame);
    }
    remainder = "";
  }

  return { frames, remainder };
}

function parseSseFrame(frameText: string): SseFrame | undefined {
  let event = "message";
  const data: string[] = [];
  for (const line of frameText.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }
  if (data.length === 0) {
    return undefined;
  }
  return { event, data: data.join("\n") };
}

/** Format only an actual backend cost; null/undefined/invalid values remain unavailable. */
export function formatCostUsd(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "Indisponível";
  }
  const raw = String(value).trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    return "Indisponível";
  }
  const sign = match[1];
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = match[3] || "";
  const preciseFraction = fraction.replace(/0+$/, "");
  const displayFraction = preciseFraction.length < 2 ? preciseFraction.padEnd(2, "0") : preciseFraction;
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `US$ ${sign}${groupedWhole}.${displayFraction}`;
}
