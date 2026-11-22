import type { Category } from "./types";

export const CATEGORY_NAMES: Record<Category, string> = {
  python: "Python", sql: "SQL", ml: "Machine Learning", dl: "Deep Learning", genai: "Generative AI", project: "Projects", hr: "HR & Behavioral",
};
export const CATEGORY_COLORS: Record<Category, string> = {
  python: "#3D7DD8", sql: "#B7791F", ml: "#0E8A6A", dl: "#8A55C9", genai: "#D2557A", project: "#2F8F9D", hr: "#6B7A70",
};
export const RUBRIC_NAMES = {
  technical_accuracy: "Technical accuracy", conceptual_understanding: "Conceptual understanding", relevance: "Relevance",
  clarity: "Explanation clarity", practical_knowledge: "Practical knowledge", communication: "Communication", structure: "Confidence & structure",
} as const;
export const DURATION_QUESTIONS: Record<number, number> = { 15: 6, 30: 10, 45: 14, 60: 18 };
export const SPEECH_LANG: Record<string, string> = { English: "en-IN", Telugu: "te-IN" };
