// Shapes returned by the backend (server/src). Keep in sync with the API.

export type Role = 'CUSTOMER' | 'SUPPORT_AGENT' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: User;
}

export interface ChatSource {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  tokenCount: number | null;
  distance: number;
  similarity: number;
  document: {
    id: string;
    title: string;
    source: string | null;
    sourceType: string | null;
    mimeType: string | null;
  };
}

export interface ChatAnswer {
  answer: string;
  sources: ChatSource[];
}

export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface KnowledgeDocument {
  id: string;
  title: string;
  source: string | null;
  mimeType: string | null;
  status: DocumentStatus;
  chunkCount: number;
  characterCount: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface UploadedDocument {
  id: string;
  title: string;
  status: DocumentStatus;
  chunkCount: number;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number | null;
  distance: number;
  similarity: number;
  document: ChatSource['document'];
}

export interface AdminUser extends User {
  questionCount: number;
  documentCount: number;
}

export interface UserList {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
  roleCounts: Record<Role, number>;
}

export type ChatOutcome = 'ANSWERED' | 'NOT_SPECIFIED' | 'NO_EVIDENCE' | 'ACTION_UNAVAILABLE' | 'FAILED';

export interface ChatAnalytics {
  days: number;
  since: string;
  totals: {
    questions: number;
    byOutcome: Record<ChatOutcome, number>;
    answerRate: number | null;
    averageLatencyMs: number | null;
    activeUsers: number;
  };
  daily: Array<{ date: string; questions: number; unanswered: number }>;
  recentUnanswered: Array<{
    id: string;
    question: string;
    outcome: ChatOutcome;
    createdAt: string;
    user: { id: string; name: string } | null;
  }>;
  topDocuments: Array<{ id: string; title: string; citations: number }>;
  /** Present for administrators only. */
  users?: { total: number; newInPeriod: number };
}

export interface HealthStatus {
  success: boolean;
  service: string;
  status: string;
}
