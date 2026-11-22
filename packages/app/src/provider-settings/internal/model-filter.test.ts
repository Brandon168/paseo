import { describe, expect, it } from "vitest";
import { filterAndRankModelEntries, listModelRoutes, rankCustomModels } from "./model-filter";

const OPENCODE_MODELS = [
  { id: "vercel-brandon-pro/google/gemini-4-neon", label: "Gemini 4 Neon", hidden: false },
  { id: "venice/aion-labs-aion-3-5", label: "Aion 3.5", hidden: false },
  {
    id: "venice/olafangensan-glm-4.7-flash-heretic",
    label: "GLM 4.7 Flash Heretic",
    hidden: false,
  },
  { id: "claude-agent/claude-sonnet-5", label: "Sonnet 5", hidden: false },
  { id: "vercel-brandon-pro/google/gemini-4-hydrogen", label: "Gemini 4 Hydrogen", hidden: false },
  { id: "venice/venice-uncensored-1-2", label: "Venice Uncensored", hidden: true },
];

describe("listModelRoutes", () => {
  it("extracts sorted distinct route prefixes", () => {
    expect(listModelRoutes(OPENCODE_MODELS)).toEqual([
      "claude-agent",
      "venice",
      "vercel-brandon-pro",
    ]);
  });

  it("ignores ids without a slash route", () => {
    expect(
      listModelRoutes([
        { id: "claude-sonnet-5" },
        { id: "/leading-slash" },
        { id: "trailing-slash/" },
      ]),
    ).toEqual([]);
  });
});

describe("filterAndRankModelEntries", () => {
  it("rejects scattered subsequence matches across route and model segments", () => {
    const matches = filterAndRankModelEntries(OPENCODE_MODELS, {
      query: "neon",
      visibility: "all",
      getModel: (m) => m,
      getHidden: (m) => m.hidden,
    });
    expect(matches.map((m) => m.id)).toEqual(["vercel-brandon-pro/google/gemini-4-neon"]);
  });

  it("still matches multi-token queries across label, id, and extra fields", () => {
    const items = OPENCODE_MODELS.map((m) => ({ model: m, providerLabel: "OpenCode" }));
    const matches = filterAndRankModelEntries(items, {
      query: "venice aion",
      visibility: "all",
      getModel: (entry) => entry.model,
      getHidden: (entry) => entry.model.hidden,
      getExtraFields: (entry) => [entry.providerLabel],
    });
    expect(matches.map((entry) => entry.model.id)).toEqual(["venice/aion-labs-aion-3-5"]);
  });

  it("composes route filter, search query, and visibility filter", () => {
    const veniceAll = filterAndRankModelEntries(OPENCODE_MODELS, {
      query: "",
      visibility: "all",
      route: "venice",
      getModel: (m) => m,
      getHidden: (m) => m.hidden,
    });
    expect(veniceAll.map((m) => m.id)).toEqual([
      "venice/aion-labs-aion-3-5",
      "venice/olafangensan-glm-4.7-flash-heretic",
      "venice/venice-uncensored-1-2",
    ]);

    const veniceDisabled = filterAndRankModelEntries(OPENCODE_MODELS, {
      query: "uncensored",
      visibility: "disabled",
      route: "venice",
      getModel: (m) => m,
      getHidden: (m) => m.hidden,
    });
    expect(veniceDisabled.map((m) => m.id)).toEqual(["venice/venice-uncensored-1-2"]);
  });
});

describe("rankCustomModels", () => {
  it("uses contiguous substring matching", () => {
    const custom = [
      { id: "venice/aion-3-5", label: "Aion 3.5" },
      { id: "vercel/gemini-4-neon", label: "Gemini 4 Neon" },
    ];
    expect(rankCustomModels(custom, "neon").map((m) => m.id)).toEqual(["vercel/gemini-4-neon"]);
  });
});
