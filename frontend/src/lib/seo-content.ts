export interface LandingPageContent {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  keywordCluster: string[];
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

export interface BlogPostContent {
  slug: string;
  title: string;
  type: "top-list" | "comparison" | "buying-guide";
  matchingProducts?: { heading: string; brand?: string; season?: string; category?: string };
  metaDescription: string;
  keywordCluster: string[];
  excerpt: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

export const landingPages: LandingPageContent[] = [
  {
    slug: "decants-bangladesh",
    title: "Perfume Decants Bangladesh",
    metaTitle: "Perfume Decants in Bangladesh | Sizes and Prices",
    metaDescription: "Learn how to choose a perfume decant in Bangladesh, then compare the available volumes and BDT prices for the fragrance you want.",
    keywordCluster: ["perfume decant bangladesh", "authentic perfume samples bd", "buy decants dhaka"],
    intro: "Valore Parfums helps buyers discover authentic fragrances through decants in Bangladesh, then upgrade to full bottles when ready.",
    sections: [
      {
        heading: "What comes in a decant?",
        paragraphs: ["A decant is a measured portion of a fragrance transferred to a smaller atomizer. The volume tells you how much perfume you receive. EDT or EDP in the fragrance name identifies the concentration."],
      },
      {
        heading: "Read the price for your size",
        paragraphs: ["Open a fragrance and choose a size to see its BDT price and availability. Two fragrances from the same house can cost different amounts for the same volume."],
      },
    ],
  },
  {
    slug: "buy-perfume-samples",
    title: "Buy Perfume Samples In Bangladesh",
    metaTitle: "Buy Perfume Samples In Bangladesh | Try Before You Buy",
    metaDescription: "Buy authentic perfume sample decants in Bangladesh and test fragrance performance before full bottle commitment.",
    keywordCluster: ["buy perfume samples", "perfume sample bangladesh", "try before buy perfume"],
    intro: "Sample-first fragrance shopping reduces blind buys and helps you choose high-value perfumes confidently.",
    sections: [
      {
        heading: "Compare two fragrances",
        paragraphs: ["Choose a note you already enjoy, such as bergamot or cinnamon, and use the shop’s note filter to find fragrances that share it. Open each product to compare the brand, concentration and available decant sizes."],
      },
      {
        heading: "Try one at a time",
        paragraphs: ["Wear each sample on a different day. Note how the opening changes after a few hours and whether you would enjoy wearing it again. If you want several scents together, the pack page lists each fragrance and the volume of each decant."],
      },
    ],
  },
  {
    slug: "full-bottle-perfume-bd",
    title: "Full Bottle Perfume Bangladesh",
    metaTitle: "Full Bottle Perfume Bangladesh | Request Authentic Bottles",
    metaDescription: "Learn how to request a full bottle in Bangladesh and distinguish a confirmed decant price from a full bottle enquiry.",
    keywordCluster: ["full bottle perfume bangladesh", "request perfume bottle bd", "authentic full bottle bd"],
    intro: "From decant testing to full bottle sourcing, this page explains a low-risk fragrance buying path for Bangladesh.",
    sections: [
      {
        heading: "Check whether the fragrance accepts requests",
        paragraphs: ["Open a fragrance in the full bottle collection. Where the request option is available, use the product page to start a request for that exact fragrance. Check the concentration in the name before sending it."],
      },
      {
        heading: "What price applies?",
        paragraphs: ["The price beside a decant size covers that volume only. A full bottle request asks the store to confirm the bottle and its price separately."],
      },
    ],
  },
  {
    slug: "affordable-perfume-decants",
    title: "Affordable Perfume Decants",
    metaTitle: "Affordable Perfume Decants Bangladesh | Premium Scents, Budget Entry",
    metaDescription: "Discover affordable perfume decants in Bangladesh and access premium designer and niche scents without full bottle cost.",
    keywordCluster: ["affordable perfume decants", "budget decant bangladesh", "cheap authentic perfume sample"],
    intro: "Affordable decants make premium perfumery accessible while preserving authenticity and quality.",
    sections: [
      {
        heading: "Compare the same volume",
        paragraphs: ["A lower starting price can mean a smaller atomizer. Pick the same size on two product pages and compare their BDT prices. For a cost-per-millilitre comparison, divide each price by the selected volume."],
      },
      {
        heading: "Set a budget for sampling",
        paragraphs: ["If you are trying several unfamiliar scents, start with smaller available sizes. A curated pack is another option. Check its total price, number of fragrances and volume per fragrance before deciding."],
      },
    ],
  },
  {
    slug: "niche-perfume-decants",
    title: "Niche Perfume Decants Bangladesh",
    metaTitle: "Niche Perfume Decants Bangladesh | Explore Rare And Premium Scents",
    metaDescription: "Shop niche perfume decants in Bangladesh. Experience rare fragrances before committing to full bottle purchases.",
    keywordCluster: ["niche perfume decants", "niche perfume bangladesh", "rare fragrance sample bd"],
    intro: "Niche perfume decants help you explore unique compositions and avoid expensive blind buys.",
    sections: [
      {
        heading: "Browse the niche collection",
        paragraphs: ["The shop groups fragrance houses into collections, including Niche. Open that filter to see which fragrances the store currently lists, then compare the notes and available sizes on each product page."],
      },
      {
        heading: "Choose by notes",
        paragraphs: ["Start with a note you know you enjoy. Read the top, middle and base notes where the catalog lists them, then try a small decant before choosing a larger size."],
      },
    ],
  },
];

export const blogPosts: BlogPostContent[] = [
  {
    slug: "best-winter-perfumes-for-men-in-bangladesh",
    matchingProducts: { heading: "Men’s winter decants", season: "Winter", category: "Men" },
    title: "Winter Perfumes for Men in Bangladesh",
    type: "top-list",
    metaDescription: "Compare winter scents for men by their catalog notes, from cinnamon and bergamot to red berries and saffron. Explore available decants in Bangladesh.",
    keywordCluster: ["best winter perfumes men bangladesh", "long lasting winter perfume bd", "winter perfume decant"],
    excerpt: "A practical buying guide for men who want winter-ready projection and longevity without blind buying full bottles.",
    sections: [
      {
        heading: "Cinnamon or saffron?",
        paragraphs: ["For a cinnamon opening, compare Afnan 9PM EDP, listed with apple and bergamot, with French Avenue Liquid Brun, listed with cardamom and bergamot. For a different direction, Viktor&Rolf Spicebomb Infrared EDT lists pink pepper, red berries and saffron."],
      },
      {
        heading: "Find your winter decant",
        paragraphs: ["The selection below uses the catalog’s Men and Winter tags. Check the concentration and size on the product page before comparing prices. A small decant lets you try the scent on a cool evening before choosing a larger volume."],
      },
    ],
  },
  {
    slug: "top-lattafa-perfumes-that-smell-expensive",
    matchingProducts: { heading: "Lattafa decants", brand: "Lattafa" },
    title: "Lattafa Perfume Decants by Scent Profile",
    type: "top-list",
    metaDescription: "Compare spicy, fruity and floral Lattafa perfumes using their fragrance notes. Check current decant sizes and BDT prices for each scent.",
    keywordCluster: ["top lattafa perfumes", "lattafa decant bangladesh", "lattafa full bottle bd"],
    excerpt: "Explore Lattafa fragrances by their notes, from warm cinnamon to orange and jasmine.",
    sections: [
      {
        heading: "Choose a scent profile",
        paragraphs: ["For spice, compare Khamrah Qahwa EDP, which lists cardamom, cinnamon and ginger, with Khamrah Dukhan EDP, which lists Indian spices, mandarin and incense. For fruit and florals, Rave Now Women EDP lists orange, red berries and jasmine."],
      },
      {
        heading: "Compare the same size",
        paragraphs: ["Open a Lattafa fragrance below to see its decant sizes and BDT prices. Choose the same volume on each page for a like-for-like comparison."],
      },
    ],
  },
  {
    slug: "decant-vs-full-bottle-which-should-you-buy",
    title: "Decant vs Full Bottle - Which Should You Buy?",
    type: "comparison",
    metaDescription: "Compare perfume decants and full bottles and learn when to check a decant price or request a bottle in Bangladesh.",
    keywordCluster: ["decant vs full bottle", "perfume buying guide bangladesh", "try before buy perfume"],
    excerpt: "Choose between a smaller atomizer for sampling and a full bottle of a fragrance you already know.",
    sections: [
      {
        heading: "When to choose a decant",
        paragraphs: ["Choose a decant when you are testing a fragrance, comparing concentrations or want a smaller atomizer. Select the size on the product page to see the price for that volume."],
      },
      {
        heading: "When to request a bottle",
        paragraphs: ["A full bottle may suit a fragrance you already wear regularly. Where the product offers a full bottle request, ask the store to confirm the bottle size, price and availability before deciding."],
      },
    ],
  },
];

export function getLandingBySlug(slug: string): LandingPageContent | undefined {
  return landingPages.find((item) => item.slug === slug);
}

export function getBlogBySlug(slug: string): BlogPostContent | undefined {
  return blogPosts.find((item) => item.slug === slug);
}
