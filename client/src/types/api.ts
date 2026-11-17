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

export interface HealthStatus {
  success: boolean;
  service: string;
  status: string;
}
