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

const RAW_CANONICAL_NOTE_LABELS = [
  "Acai Berry", "Acerola", "Acorn", "Akebia fruit", "Algae", "Aloe Vera", "Aldehydes", "Almond", "Amber", "Ambergris",
  "Ambroxan", "Amaretto", "Angelica", "Anise", "Apple", "Apple Juice", "Apple Mint", "Apple Pulp", "Apricot", "Apricot Blossom",
  "Argan", "Artichoke", "Ashberry", "Aquatic Notes", "Avocado", "Bamboo", "Banana", "Balsamic Notes", "Barberry", "Basil",
  "Bay Leaf", "Bearberry", "Beetroot", "Benzoin", "Bergamot", "Berries", "Bitter Orange", "Black Cherry", "Black Currant", "Black Pepper",
  "Blackberry", "Black Sapote", "Black Walnut", "Blackthorn", "Blood Orange", "Blueberry", "Boysenberry", "Brazil Nut", "Bread", "Breadnut",
  "Brown Sugar", "Buckwheat", "Bulrush", "Burnt Sugar", "Butter", "Cacao", "Cacao Butter", "Cactus", "Calamus", "Calone",
  "Candied Lemon", "Candied Orange", "Caramel", "Caraway", "Cardamom", "Carnation", "Carrot", "Cashew", "Cassia", "Cashmeran",
  "Cedar", "Celery", "Celery Seeds", "Chamomile", "Cherry", "Cherry Blossom", "Chestnut", "Chia Seed", "Chickpeas", "Chicory",
  "Chocolate", "Cinnamon", "Cilantro", "Cistus Incanus", "Citron", "Clary Sage", "Clove", "Cloves", "Cocoa", "Coconut",
  "Coconut Blossom", "Coconut Water", "Coffee", "Cognac", "Corn", "Corn Silk", "Coriander", "Coumarin", "Cream", "Cranberry",
  "Cucumber", "Cumin", "Currant Leaf and Bud", "Cypress", "Davana", "Dihydromyrcenol", "Dried Fruits", "Durian", "Elderberry", "Elderflower",
  "Espresso", "Ethyl Maltol", "Eucalyptus", "Feijoa Fruit", "Fig", "Fig Leaf", "Fir", "Floral Notes", "Forest Fruits", "Freesia",
  "Fruity Notes", "Galbanum", "Gardenia", "Geranium", "Ginger", "Ginseng", "Goji Berries", "Goldenberry", "Gooseberry", "Grape Seed",
  "Grapefruit", "Grapes", "Green Apple", "Green Grape", "Green Notes", "Green Pear", "Green Tea", "Guaiac Wood", "Guarana", "Guava",
  "Hazel", "Hazelnut", "Hedione", "Heliotrope", "Herbal Notes", "Hibiscus", "Honey", "Hops", "Hyacinth", "Ice cream",
  "Incense", "Indole", "Indian Spices", "Iris", "Iso E Super", "Jasmine", "Jasmine Tea", "Juniper", "Juniper Berries", "Kiwi",
  "Kumquat", "Labdanum", "Lavender", "Leather", "Lemon", "Lemon Zest", "Lemongrass", "Licorice", "Lily", "Lily-of-the-Valley",
  "Lime", "Lime Blossom", "Linalool", "Litchi", "Lychee", "Loganberry", "Lotus", "Macadamia", "Magnolia", "Malta",
  "Mandarin", "Mandarin Orange", "Mango", "Marine Notes", "Marshmallow", "Mate", "Melilotus", "Melon", "Milk", "Millet",
  "Mint", "Mirabelle", "Molasses", "Moss", "Muguet", "Mulberry", "Mushroom", "Musk", "Myrrh", "Narcissus",
  "Nectarine", "Neroli", "Nutmeg", "Nutty Notes", "Oakmoss", "Oat", "Olibanum (Frankincense)", "Olive", "Olive Leaf", "Onion",
  "Orange", "Orange Blossom", "Oregano", "Orris Root", "Oud", "Papaya", "Parsley", "Passionfruit", "Patchouli", "Peach",
  "Peanut", "Pear", "Pecan", "Pepper", "Peppermint", "Petitgrain", "Pine", "Pine Resin", "Pineapple", "Pink Pepper",
  "Pistachio", "Plantain", "Plum", "Pomegranate", "Potato", "Praline", "Prickly Pear", "Pumpkin", "Quince", "Rambutan",
  "Raspberry", "Red Apple", "Red Berries", "Red Currant", "Resins", "Rhubarb", "Rice", "Rose", "Rose Hip", "Rosemary",
  "Rowanberry", "Rum", "Rye", "Safflower", "Saffron", "Sage", "Salt", "Sandalwood", "Savory", "Sea Notes",
  "Sea Water", "Seaweed", "Sesame", "Sesame Seed", "Smoke", "Sour Cherry", "Soybean", "Spearmint", "Spicy Notes", "Spinach",
  "Star Anise", "Star Fruit", "Strawberry", "Strawberry Leaf", "Sugar", "Sugar Cane", "Suede", "Sweet Pea", "Tamarind", "Tangerine",
  "Tapioca", "Taro", "Tea", "Tea Leaf", "Thyme", "Thistle", "Tobacco", "Tomato", "Tomato Leaf", "Tonka Bean",
  "Tropical Fruits", "Truffle", "Tuberose", "Turmeric", "Turnip", "Vanilla", "Vanilla Bean", "Vegetal Notes", "Vetiver", "Violet",
  "Water Fruit", "Watermelon", "Wheat", "Whiskey", "White Chocolate", "White Currant", "White Grape", "White Musk", "White Woods", "Wild Strawberry",
  "Wine", "Woodsy Notes", "Ylang-Ylang", "Yogurt", "Yuzu", "Zucchini",
];

const CANONICAL_NOTE_LABELS = uniqueSorted(RAW_CANONICAL_NOTE_LABELS);

const CANONICAL_CATEGORIES: NotesLibraryCategory[] = [
  {
    id: "all-notes",
    label: "All Notes",
    notes: [...CANONICAL_NOTE_LABELS],
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
    version: 2,
    categories,
    notes,
    noteLabels: [...CANONICAL_NOTE_LABELS],
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
