import { Router } from 'express';

import { answerCustomerQuestion } from '../ai/chat.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { chatRateLimiter } from '../middleware/rateLimits.js';
import { validateBody } from '../middleware/validate.js';
import { chatQuestionSchema, type ChatQuestionInput } from '../schemas/chat.schemas.js';
import { recordChat } from '../services/chat-log.service.js';

export const chatRouter = Router();

// The knowledge base is global, so every authenticated role may ask questions.
// Every question is logged (outcome, sources, latency) for staff analytics.
chatRouter.post(
  '/',
  authenticate,
  chatRateLimiter,
  validateBody(chatQuestionSchema),
  async (req, res) => {
    const { question } = req.body as ChatQuestionInput;
    const userId = req.user!.id;
    const started = performance.now();

    let result: Awaited<ReturnType<typeof answerCustomerQuestion>>;
    try {
      result = await answerCustomerQuestion(question);
    } catch (error) {
      await recordChat({ userId, question, latencyMs: performance.now() - started });
      throw error;
    }

    await recordChat({ userId, question, latencyMs: performance.now() - started, result });

    res.status(200).json({ success: true, ...result });
  },
);
