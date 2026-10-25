import { z } from 'zod';

export const searchKnowledgeSchema = z.object({
  query: z.string().trim().min(1, 'Query is required'),
  // Keep this aligned with MAX_RETRIEVAL_TOP_K in the retrieval service.
  topK: z
    .number()
    .int('topK must be an integer')
    .min(1, 'topK must be at least 1')
    .max(20, 'topK must be at most 20')
    .optional(),
});

export type SearchKnowledgeInput = z.infer<typeof searchKnowledgeSchema>;
