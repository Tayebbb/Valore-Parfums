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
  metaDescription: string;
  keywordCluster: string[];
  excerpt: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}

const evergreenParagraphs = [
  "Bangladeshi perfume buyers are now much more educated than before. Instead of blind buying expensive bottles, they compare batches, check reformulations, and evaluate dry down performance in Dhaka heat and humidity. This makes decants the most practical path for building a fragrance wardrobe without overspending.",
  "A proper decant store should always explain bottle source, decant hygiene, atomizer quality, and storage practice. Buyers do not only want low price; they want trust signals that prove authenticity. When those trust signals are visible, conversion rates increase and repeat purchase becomes predictable.",
  "Perfume sampling is not only for beginners. Experienced collectors use decants for travel rotation, office-safe testing, layering experiments, and before-upgrade evaluation. In Bangladesh where full bottle inventory fluctuates, decants and on-request sourcing create a stable buying journey for every budget tier.",
  "Search intent in fragrance commerce is highly specific. Users search for perfume name + decant size, brand + price in Bangladesh, and full bottle availability. Pages that include this intent directly in headings, internal links, and CTAs usually perform better than generic e-commerce pages.",
  "Customers who first buy 3ml or 10ml often convert into 30ml repeat buyers and later request full bottles. This is why every decant page should include educational content, social proof, and an explicit full bottle upsell path. The best stores make that transition effortless.",
];

function buildLongSections(topic: string): Array<{ heading: string; paragraphs: string[] }> {
  return [
    {
      heading: `${topic}: Why Demand Keeps Growing in Bangladesh`,
      paragraphs: [...evergreenParagraphs],
    },
    {
      heading: "How To Choose The Right Decant Size",
      paragraphs: [
        "A 3ml decant works best for first impression testing across 2-4 full wearings. A 10ml decant is ideal when you like the scent and want to test in different weather and social contexts. A 15ml or 30ml decant is for fragrances you already trust and plan to wear regularly.",
        "For office buyers, smaller atomizers help avoid carrying heavy bottles and reduce risk of breakage. For enthusiasts, mid-size decants are useful for layering and side-by-side comparisons between flankers and concentration variants.",
        ...evergreenParagraphs.slice(0, 3),
      ],
    },
    {
      heading: "Authenticity, Hygiene, And Buyer Confidence",
      paragraphs: [
        "Authenticity is the highest conversion driver in perfume commerce. Buyers need transparent sourcing statements and visible bottle photos. Hygiene standards are equally important: sterile tools, clean funnels, and fresh atomizers should be part of every decant process.",
        "When stores publish sterile decant process documentation, they reduce customer hesitation. This boosts both direct conversion and branded search trust, especially for high-demand names from Dior, Lattafa, Maison Francis Kurkdjian, Tom Ford, and Creed.",
        ...evergreenParagraphs.slice(2),
      ],
    },
    {
      heading: "Decant To Full Bottle Upsell Framework",
      paragraphs: [
        "Full bottle requests should be positioned as a continuation of sampling, not a separate journey. A buyer tests 10ml, confirms longevity and projection, then requests a full bottle from the same page. This behavior is common and should be intentionally supported.",
        "Successful stores prefill a full bottle request message with perfume name and brand, reducing friction for mobile users. WhatsApp routing plus on-site request forms improves lead capture and gives users channel choice.",
        ...evergreenParagraphs,
      ],
    },
  ];
}

export const landingPages: LandingPageContent[] = [
  {
    slug: "decants-bangladesh",
    title: "Perfume Decants Bangladesh",
    metaTitle: "Perfume Decants Bangladesh | 3ml, 10ml, 15ml, 30ml Authentic Samples",
    metaDescription: "Shop authentic perfume decants in Bangladesh. Try 3ml, 10ml, 15ml, and 30ml before full bottle purchase.",
    keywordCluster: ["perfume decant bangladesh", "authentic perfume samples bd", "buy decants dhaka"],
    intro: "Valore Parfums helps buyers discover authentic fragrances through decants in Bangladesh, then upgrade to full bottles when ready.",
    sections: buildLongSections("Perfume Decants"),
  },
  {
    slug: "buy-perfume-samples",
    title: "Buy Perfume Samples In Bangladesh",
    metaTitle: "Buy Perfume Samples In Bangladesh | Try Before You Buy",
    metaDescription: "Buy authentic perfume sample decants in Bangladesh and test fragrance performance before full bottle commitment.",
    keywordCluster: ["buy perfume samples", "perfume sample bangladesh", "try before buy perfume"],
    intro: "Sample-first fragrance shopping reduces blind buys and helps you choose high-value perfumes confidently.",
    sections: buildLongSections("Perfume Samples"),
  },
  {
    slug: "full-bottle-perfume-bd",
    title: "Full Bottle Perfume Bangladesh",
    metaTitle: "Full Bottle Perfume Bangladesh | Request Authentic Bottles",
    metaDescription: "Request authentic full bottle perfumes in Bangladesh after testing decants. Fast sourcing for popular and niche scents.",
    keywordCluster: ["full bottle perfume bangladesh", "request perfume bottle bd", "authentic full bottle bd"],
    intro: "From decant testing to full bottle sourcing, this page explains a low-risk fragrance buying path for Bangladesh.",
    sections: buildLongSections("Full Bottle Perfume"),
  },
  {
    slug: "affordable-perfume-decants",
    title: "Affordable Perfume Decants",
    metaTitle: "Affordable Perfume Decants Bangladesh | Premium Scents, Budget Entry",
    metaDescription: "Discover affordable perfume decants in Bangladesh and access premium designer and niche scents without full bottle cost.",
    keywordCluster: ["affordable perfume decants", "budget decant bangladesh", "cheap authentic perfume sample"],
    intro: "Affordable decants make premium perfumery accessible while preserving authenticity and quality.",
    sections: buildLongSections("Affordable Decants"),
  },
  {
    slug: "niche-perfume-decants",
    title: "Niche Perfume Decants Bangladesh",
    metaTitle: "Niche Perfume Decants Bangladesh | Explore Rare And Premium Scents",
    metaDescription: "Shop niche perfume decants in Bangladesh. Experience rare fragrances before committing to full bottle purchases.",
    keywordCluster: ["niche perfume decants", "niche perfume bangladesh", "rare fragrance sample bd"],
    intro: "Niche perfume decants help you explore unique compositions and avoid expensive blind buys.",
    sections: buildLongSections("Niche Perfume Decants"),
  },
];

export const blogPosts: BlogPostContent[] = [
  {
    slug: "best-winter-perfumes-for-men-in-bangladesh",
    title: "Best Winter Perfumes for Men in Bangladesh",
    type: "top-list",
    metaDescription: "Discover long-lasting winter perfumes for men in Bangladesh and test top picks with decants before full bottle purchase.",
    keywordCluster: ["best winter perfumes men bangladesh", "long lasting winter perfume bd", "winter perfume decant"],
    excerpt: "A practical buying guide for men who want winter-ready projection and longevity without blind buying full bottles.",
    sections: buildLongSections("Winter Perfume Selection"),
  },
  {
    slug: "top-lattafa-perfumes-that-smell-expensive",
    title: "Top Lattafa Perfumes That Smell Expensive",
    type: "top-list",
    metaDescription: "Explore top Lattafa perfumes that smell premium. Try decants in Bangladesh before committing to full bottle purchases.",
    keywordCluster: ["top lattafa perfumes", "lattafa decant bangladesh", "lattafa full bottle bd"],
    excerpt: "A curated list of high-value Lattafa fragrances with sampling-first recommendations for Bangladeshi buyers.",
    sections: buildLongSections("Lattafa Perfume Rankings"),
  },
  {
    slug: "decant-vs-full-bottle-which-should-you-buy",
    title: "Decant vs Full Bottle - Which Should You Buy?",
    type: "comparison",
    metaDescription: "Compare perfume decants and full bottles with a buyer-intent framework for Bangladesh fragrance shoppers.",
    keywordCluster: ["decant vs full bottle", "perfume buying guide bangladesh", "try before buy perfume"],
    excerpt: "A conversion-focused framework to decide when a decant is enough and when a full bottle makes sense.",
    sections: buildLongSections("Decant vs Full Bottle"),
  },
];

export function getLandingBySlug(slug: string): LandingPageContent | undefined {
  return landingPages.find((item) => item.slug === slug);
}

export function getBlogBySlug(slug: string): BlogPostContent | undefined {
  return blogPosts.find((item) => item.slug === slug);
}
