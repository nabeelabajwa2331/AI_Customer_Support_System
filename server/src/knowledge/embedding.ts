
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const EMBEDDING_MODEL = "text-embedding-3-small";

export async function generateEmbedding(
  text: string,
): Promise<number[]> {
  const normalizedText = text.trim();

  if (!normalizedText) {
    throw new Error("Cannot generate an embedding for empty text.");
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: normalizedText,
    dimensions: 1536,
  });

  const result = response.data[0];

if (!result) {
  throw new Error("OpenAI returned no embedding data.");
}

return result.embedding;
}
