export interface SearchCategory {
  id: string;
  label: string;
  emoji: string;
  example: string;
  hint: string;
  /** Optional route override (used for /insta upload flow). */
  to?: string;
}

export const SEARCH_CATEGORIES: SearchCategory[] = [
  {
    id: "shopping",
    emoji: "🛒",
    label: "Shopping",
    hint: "Compare picks",
    example: "best noise-cancelling headphones under $300",
  },
  {
    id: "price",
    emoji: "📈",
    label: "Price history",
    hint: "Buy now or wait",
    example: "price history of Sony WH-1000XM5",
  },
  {
    id: "trip",
    emoji: "✈️",
    label: "Trip planning",
    hint: "Day-by-day plan",
    example: "5-day trip to Lisbon in October",
  },

  {
    id: "recipes",
    emoji: "🍳",
    label: "Recipes",
    hint: "What's for dinner",
    example: "easy 30-minute weeknight dinners with chicken",
  },
  {
    id: "gifts",
    emoji: "🎁",
    label: "Gift finder",
    hint: "Perfect present",
    example: "thoughtful birthday gift for a 30-year-old hiker under $80",
  },
  {
    id: "books",
    emoji: "📚",
    label: "Books",
    hint: "Your next read",
    example: "best sci-fi novels like Project Hail Mary",
  },
  {
    id: "movies",
    emoji: "🎬",
    label: "Movies & TV",
    hint: "What to watch",
    example: "smart psychological thrillers on Netflix 2025",
  },
  {
    id: "code",
    emoji: "💻",
    label: "Coding help",
    hint: "Solve a bug",
    example: "explain useTransition in React 19 with examples",
  },
  {
    id: "career",
    emoji: "💼",
    label: "Career",
    hint: "Resume & jobs",
    example: "how to write a senior frontend engineer resume in 2025",
  },
  {
    id: "fitness",
    emoji: "💪",
    label: "Fitness",
    hint: "Get a plan",
    example: "12-week home workout plan for fat loss, no equipment",
  },
  {
    id: "health",
    emoji: "🩺",
    label: "Health",
    hint: "Quick answers",
    example: "what causes morning back stiffness and how to fix it",
  },
  {
    id: "finance",
    emoji: "💰",
    label: "Finance",
    hint: "Money decisions",
    example: "best high-yield savings accounts in the US right now",
  },
  {
    id: "events",
    emoji: "🎟️",
    label: "Local events",
    hint: "Tonight & weekend",
    example: "best live music events in Berlin this weekend",
  },
  {
    id: "food",
    emoji: "🍜",
    label: "Restaurants",
    hint: "Where to eat",
    example: "best ramen in Tokyo Shibuya area for tourists",
  },
  {
    id: "home",
    emoji: "🛋️",
    label: "Home & decor",
    hint: "Style your space",
    example: "minimalist scandinavian living room ideas under $1000",
  },
  {
    id: "tech",
    emoji: "📱",
    label: "Tech compare",
    hint: "X vs Y",
    example: "iPhone 17 Pro vs Samsung Galaxy S25 Ultra",
  },
  {
    id: "learn",
    emoji: "🎓",
    label: "Learning path",
    hint: "Master a skill",
    example: "best free roadmap to learn machine learning in 2025",
  },
  {
    id: "news",
    emoji: "📰",
    label: "News digest",
    hint: "Catch up fast",
    example: "summarize this week's biggest tech news",
  },
  {
    id: "tools",
    emoji: "⚡",
    label: "Productivity",
    hint: "Work smarter",
    example: "best AI-powered note-taking apps for students",
  },
];
