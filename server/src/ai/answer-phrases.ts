// Fixed sentences the assistant uses. Kept in their own module so other code
// (for example the chat log classifier) can rely on them without loading the
// chat service and its model client.

/**
 * Fixed sentence for "the material is related but does not answer this". A
 * fixed phrase is easier for a small model to reproduce than free-form text.
 */
export const NOT_SPECIFIED_PHRASE = 'The available policy does not specify this.';

/** Fixed opening for action requests; the assistant has no order or refund tools. */
export const ACTION_UNAVAILABLE_PHRASE =
  "I'm not able to do that, because I can't access orders, refunds, or accounts.";

/** Used when validation leaves nothing customer-facing (e.g. a bare label). */
export const NOT_SPECIFIED_FALLBACK_ANSWER = `${NOT_SPECIFIED_PHRASE} Please contact support for clarification.`;

/**
 * Returned without calling the model when no retrieved chunk passes the
 * relevance gate. Deterministic so clients and tests can rely on it.
 */
export const NO_RELEVANT_EVIDENCE_ANSWER =
  "I couldn't find enough relevant information in the available knowledge base to answer that. Could you rephrase your question or add more detail? If you still need help, please contact support.";
