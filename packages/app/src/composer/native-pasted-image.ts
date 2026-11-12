import { resolveRasterImageMimeType } from "@/attachments/file-types";
import type { PickedImageAttachmentInput } from "@/hooks/image-attachment-picker";

export interface NativePastedFile {
  fileName: string;
  fileSize: number;
  type: string;
  uri: string;
}

export class UnsupportedPastedImageError extends Error {
  constructor(fileName: string) {
    super(`Unsupported pasted image '${fileName}'.`);
    this.name = "UnsupportedPastedImageError";
  }
}

function normalizePastedRasterFiles(
  files: readonly NativePastedFile[],
): PickedImageAttachmentInput[] {
  return files.map((file) => {
    const mimeType = resolveRasterImageMimeType({
      mimeType: file.type,
      path: file.fileName,
    });
    if (!mimeType) {
      throw new UnsupportedPastedImageError(file.fileName);
    }
    return {
      source: { kind: "file_uri", uri: file.uri },
      mimeType,
      fileName: file.fileName,
    };
  });
}

export interface NormalizeNativePastedImagesOptions {
  readClipboardImage?: () => Promise<PickedImageAttachmentInput | null>;
}

export async function normalizeNativePastedImages(
  files: readonly NativePastedFile[],
  options: NormalizeNativePastedImagesOptions = {},
): Promise<PickedImageAttachmentInput[]> {
  if (files.length > 0) {
    try {
      return normalizePastedRasterFiles(files);
    } catch (error) {
      if (!(error instanceof UnsupportedPastedImageError) || !options.readClipboardImage) {
        throw error;
      }
      const clipboardImage = await options.readClipboardImage();
      if (clipboardImage) {
        return [clipboardImage];
      }
      throw error;
    }
  }

  if (!options.readClipboardImage) {
    return [];
  }
  const clipboardImage = await options.readClipboardImage();
  return clipboardImage ? [clipboardImage] : [];
}
