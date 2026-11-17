import { Router } from 'express';

import { answerCustomerQuestion } from '../ai/chat.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { chatRateLimiter } from '../middleware/rateLimits.js';
import { validateBody } from '../middleware/validate.js';
import { chatQuestionSchema, type ChatQuestionInput } from '../schemas/chat.schemas.js';

export const chatRouter = Router();

// The knowledge base is global, so every authenticated role may ask questions.
chatRouter.post(
  '/',
  authenticate,
  chatRateLimiter,
  validateBody(chatQuestionSchema),
  async (req, res) => {
    const { question } = req.body as ChatQuestionInput;
    const result = await answerCustomerQuestion(question);

    res.status(200).json({ success: true, ...result });
  },
);
