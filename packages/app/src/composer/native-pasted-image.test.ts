import { describe, expect, it } from "vitest";
import { normalizeNativePastedImages, UnsupportedPastedImageError } from "./native-pasted-image";

describe("normalizeNativePastedImages", () => {
  it("turns pasted native image files into the existing picked-image input", async () => {
    const normalized = await normalizeNativePastedImages(
      [
        {
          fileName: "clipboard.jpg",
          fileSize: 128,
          type: "image/jpg",
          uri: "file:///cache/clipboard.jpg",
        },
        {
          fileName: "animation.gif",
          fileSize: 256,
          type: "image/gif",
          uri: "file:///cache/animation.gif",
        },
      ],
      {
        readClipboardImage: async () => {
          throw new Error("clipboard fallback should not run when pasted files are raster images");
        },
      },
    );

    expect(normalized).toEqual([
      {
        source: { kind: "file_uri", uri: "file:///cache/clipboard.jpg" },
        mimeType: "image/jpeg",
        fileName: "clipboard.jpg",
      },
      {
        source: { kind: "file_uri", uri: "file:///cache/animation.gif" },
        mimeType: "image/gif",
        fileName: "animation.gif",
      },
    ]);
  });

  it("rejects non-image content instead of swallowing it as an attachment", async () => {
    await expect(
      async () =>
        await normalizeNativePastedImages(
          [
            {
              fileName: "notes.txt",
              fileSize: 12,
              type: "text/plain",
              uri: "file:///cache/notes.txt",
            },
          ],
          { readClipboardImage: async () => null },
        ),
    ).rejects.toThrow(UnsupportedPastedImageError);
  });

  it("falls back to the clipboard image when native paste reports no extracted files", async () => {
    const normalized = await normalizeNativePastedImages([], {
      readClipboardImage: async () => ({
        source: { kind: "data_url", dataUrl: "data:image/png;base64,abc" },
        mimeType: "image/png",
        fileName: "clipboard.png",
      }),
    });

    expect(normalized).toEqual([
      {
        source: { kind: "data_url", dataUrl: "data:image/png;base64,abc" },
        mimeType: "image/png",
        fileName: "clipboard.png",
      },
    ]);
  });

  it("falls back to the clipboard image when a pasted file has an unrecognized UTI", async () => {
    const normalized = await normalizeNativePastedImages(
      [
        {
          fileName: "clipboard.bin",
          fileSize: 128,
          type: "application/octet-stream",
          uri: "file:///cache/clipboard.bin",
        },
      ],
      {
        readClipboardImage: async () => ({
          source: { kind: "data_url", dataUrl: "data:image/png;base64,abc" },
          mimeType: "image/png",
          fileName: "clipboard.png",
        }),
      },
    );

    expect(normalized).toEqual([
      {
        source: { kind: "data_url", dataUrl: "data:image/png;base64,abc" },
        mimeType: "image/png",
        fileName: "clipboard.png",
      },
    ]);
  });

  it("propagates clipboard reader errors instead of masking them", async () => {
    const clipboardFailure = new Error("clipboard unavailable");

    await expect(
      async () =>
        await normalizeNativePastedImages([], {
          readClipboardImage: async () => {
            throw clipboardFailure;
          },
        }),
    ).rejects.toBe(clipboardFailure);
  });
});
