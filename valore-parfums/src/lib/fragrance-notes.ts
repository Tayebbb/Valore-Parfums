export interface NotesLibraryCategory {
  id: string;
  label: string;
  emphasis?: "high" | "trending" | "core";
  notes: string[];
}

export interface NotesLibraryNote {
  id: string;
  label: string;
  categoryId: string;
  categoryLabel: string;
  emphasis?: "high" | "trending" | "core";
}

export interface NotesLibrary {
  version: number;
  categories: NotesLibraryCategory[];
  notes: NotesLibraryNote[];
  noteLabels: string[];
}

export interface StructuredFragranceSelection {
  fragranceNoteIds: {
    top: string[];
    middle: string[];
    base: string[];
    all: string[];
  };
  fragranceNotes: {
    top: string[];
    middle: string[];
    base: string[];
    all: string[];
  };
  keyNotes: string[];
  noteSearchIndex: string[];
  noteIdIndex: Record<string, 1>;
}

const CANONICAL_CATEGORIES: NotesLibraryCategory[] = [
  {
    id: "citrus-top-notes",
    label: "Citrus (Top Notes)",
    notes: ["Bergamot", "Lemon", "Orange", "Mandarin Orange", "Grapefruit", "Lime", "Yuzu", "Neroli", "Petitgrain"],
  },
  {
    id: "fruity",
    label: "Fruity",
    notes: ["Apple", "Pear", "Peach", "Apricot", "Cherry", "Strawberry", "Raspberry", "Blackberry", "Plum", "Pineapple", "Mango", "Coconut", "Watermelon", "Pomegranate", "Lychee", "Fig"],
  },
  {
    id: "floral",
    label: "Floral",
    emphasis: "high",
    notes: ["Rose", "Jasmine", "Orange Blossom", "Tuberose", "Ylang-Ylang", "Lavender", "Violet", "Iris", "Lily-of-the-Valley", "Peony", "Magnolia", "Gardenia", "Freesia", "Geranium", "Hibiscus", "Narcissus"],
  },
  {
    id: "green-fresh",
    label: "Green/Fresh",
    notes: ["Green Notes", "Mint", "Basil", "Rosemary", "Thyme", "Sage", "Tea", "Matcha", "Grass", "Violet Leaf"],
  },
  {
    id: "spices",
    label: "Spices",
    notes: ["Cinnamon", "Cardamom", "Clove", "Nutmeg", "Black Pepper", "Pink Pepper", "Saffron", "Ginger"],
  },
  {
    id: "gourmand",
    label: "Gourmand",
    emphasis: "trending",
    notes: ["Vanilla", "Caramel", "Chocolate", "Honey", "Coffee", "Cocoa", "Almond", "Hazelnut", "Tonka Bean", "Sugar", "Marshmallow"],
  },
  {
    id: "woody",
    label: "Woody",
    emphasis: "core",
    notes: ["Sandalwood", "Cedar", "Patchouli", "Vetiver", "Oud (Agarwood)", "Guaiac Wood", "Cashmere Wood"],
  },
  {
    id: "resins-balsamic",
    label: "Resins/Balsamic",
    notes: ["Amber", "Benzoin", "Myrrh", "Frankincense (Olibanum)", "Labdanum"],
  },
  {
    id: "animalic-musk",
    label: "Animalic/Musk",
    notes: ["Musk", "Ambergris", "Leather", "Suede"],
  },
  {
    id: "aquatic-fresh",
    label: "Aquatic/Fresh",
    notes: ["Marine Notes", "Sea Water", "Ozonic Notes", "Aldehydes"],
  },
  {
    id: "modern-synthetics",
    label: "Modern Synthetics",
    notes: ["Ambroxan", "Iso E Super", "Cashmeran", "Hedione", "Calone", "Coumarin", "Ethyl Maltol", "Vanillin"],
  },
];

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function buildNotes(categories: NotesLibraryCategory[]): NotesLibraryNote[] {
  const notes: NotesLibraryNote[] = [];
  for (const category of categories) {
    for (const label of category.notes) {
      const note: NotesLibraryNote = {
        id: `${category.id}__${slug(label)}`,
        label,
        categoryId: category.id,
        categoryLabel: category.label,
      };
      if (category.emphasis) {
        note.emphasis = category.emphasis;
      }
      notes.push(note);
    }
  }
  return notes;
}

export function getCanonicalNotesLibrary(): NotesLibrary {
  const categories = CANONICAL_CATEGORIES.map((category) => {
    const next: NotesLibraryCategory = {
      id: category.id,
      label: category.label,
      notes: [...category.notes],
    };
    if (category.emphasis) {
      next.emphasis = category.emphasis;
    }
    return next;
  });
  const notes = buildNotes(categories);
  return {
    version: 1,
    categories,
    notes,
    noteLabels: notes.map((note) => note.label).sort((a, b) => a.localeCompare(b)),
  };
}

export function getNoteLookup(library: NotesLibrary = getCanonicalNotesLibrary()): {
  byId: Map<string, NotesLibraryNote>;
  byLabel: Map<string, NotesLibraryNote>;
} {
  const byId = new Map<string, NotesLibraryNote>();
  const byLabel = new Map<string, NotesLibraryNote>();

  for (const note of library.notes) {
    byId.set(note.id, note);
    byLabel.set(note.label.toLowerCase(), note);
  }

  return { byId, byLabel };
}

function normalizeIdList(values: unknown, byId: Map<string, NotesLibraryNote>): string[] {
  const list = Array.isArray(values) ? values : [];
  return uniqueSorted(
    list
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => byId.has(value)),
  );
}

function normalizeNameList(values: unknown, byLabel: Map<string, NotesLibraryNote>): string[] {
  const list = Array.isArray(values) ? values : [];
  const ids = list
    .filter((value): value is string => typeof value === "string")
    .map((value) => byLabel.get(value.trim().toLowerCase())?.id || "")
    .filter(Boolean);
  return uniqueSorted(ids);
}

function resolveLabels(ids: string[], byId: Map<string, NotesLibraryNote>): string[] {
  return uniqueSorted(ids.map((id) => byId.get(id)?.label || "").filter(Boolean));
}

function toKeyNotes(top: string[], middle: string[], base: string[], all: string[]): string[] {
  const ordered = [...top, ...middle, ...base, ...all];
  return Array.from(new Set(ordered)).slice(0, 3);
}

export function buildStructuredNotes(input: unknown, library: NotesLibrary = getCanonicalNotesLibrary()): StructuredFragranceSelection {
  const source = (input && typeof input === "object" ? input : {}) as {
    fragranceNoteIds?: { top?: unknown; middle?: unknown; base?: unknown; all?: unknown };
    topNoteIds?: unknown;
    middleNoteIds?: unknown;
    baseNoteIds?: unknown;
    fragranceNotes?: { top?: unknown; middle?: unknown; base?: unknown; all?: unknown };
    topNotes?: unknown;
    middleNotes?: unknown;
    baseNotes?: unknown;
  };

  const { byId, byLabel } = getNoteLookup(library);

  const topIds = uniqueSorted([
    ...normalizeIdList(source.fragranceNoteIds?.top, byId),
    ...normalizeIdList(source.topNoteIds, byId),
    ...normalizeNameList(source.fragranceNotes?.top, byLabel),
    ...normalizeNameList(source.topNotes, byLabel),
  ]);

  const middleIds = uniqueSorted([
    ...normalizeIdList(source.fragranceNoteIds?.middle, byId),
    ...normalizeIdList(source.middleNoteIds, byId),
    ...normalizeNameList(source.fragranceNotes?.middle, byLabel),
    ...normalizeNameList(source.middleNotes, byLabel),
  ]);

  const baseIds = uniqueSorted([
    ...normalizeIdList(source.fragranceNoteIds?.base, byId),
    ...normalizeIdList(source.baseNoteIds, byId),
    ...normalizeNameList(source.fragranceNotes?.base, byLabel),
    ...normalizeNameList(source.baseNotes, byLabel),
  ]);

  const allIds = uniqueSorted([
    ...topIds,
    ...middleIds,
    ...baseIds,
    ...normalizeIdList(source.fragranceNoteIds?.all, byId),
    ...normalizeNameList(source.fragranceNotes?.all, byLabel),
  ]);

  const top = resolveLabels(topIds, byId);
  const middle = resolveLabels(middleIds, byId);
  const base = resolveLabels(baseIds, byId);
  const all = resolveLabels(allIds, byId);
  const keyNotes = toKeyNotes(top, middle, base, all);

  const noteSearchIndex = uniqueSorted([
    ...all.map((label) => label.toLowerCase()),
    ...allIds,
  ]);

  const noteIdIndex = allIds.reduce<Record<string, 1>>((acc, id) => {
    acc[id] = 1;
    return acc;
  }, {});

  return {
    fragranceNoteIds: { top: topIds, middle: middleIds, base: baseIds, all: allIds },
    fragranceNotes: { top, middle, base, all },
    keyNotes,
    noteSearchIndex,
    noteIdIndex,
  };
}
