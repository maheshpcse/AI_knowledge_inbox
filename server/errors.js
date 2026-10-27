import OpenAI from 'openai';

export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const quotaMessages = {
  credit_balance_exhausted: 'OpenAI API credits are exhausted. Add credits in your OpenAI Platform billing settings, then try again.',
  organization_spend_limit_exceeded: 'Your OpenAI organization spend limit has been reached. Review the organization limits before retrying.',
  project_spend_limit_exceeded: 'Your OpenAI project spend limit has been reached. Review the project limits before retrying.',
  organization_usage_limit_exceeded: 'Your OpenAI organization usage limit has been reached. Request a higher usage limit before retrying.',
  insufficient_quota: 'Your OpenAI API quota is unavailable. Check the credit balance and usage limits for the project associated with your API key before retrying.',
};

export function publicError(error) {
  if (error instanceof AppError) return error;
  if (error.type === 'entity.too.large') return new AppError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  if (error.type === 'entity.parse.failed') return new AppError(400, 'INVALID_JSON', 'Send valid JSON.');
  if (error instanceof OpenAI.APIError) {
    const quotaMessage = quotaMessages[error.code] || (error.type === 'insufficient_quota' ? quotaMessages.insufficient_quota : null);
    if (error.status === 429 && quotaMessage) return new AppError(429, 'AI_QUOTA_EXCEEDED', quotaMessage);
    if (error.status === 429) return new AppError(429, 'AI_RATE_LIMITED', 'OpenAI temporarily limited requests. Wait before trying again.');
    if (error.status === 401) return new AppError(503, 'AI_AUTH_FAILED', 'OpenAI rejected the API key. Check OPENAI_API_KEY in .env and restart the server.');
    if (error.status === 403 || error.status === 404) return new AppError(503, 'AI_MODEL_ACCESS', 'The configured OpenAI model is unavailable or access is denied. Check the model settings and API project permissions.');
    if (error instanceof OpenAI.APIConnectionTimeoutError) return new AppError(504, 'AI_TIMEOUT', 'OpenAI took too long to respond. Please try again.');
    return new AppError(502, 'AI_UNAVAILABLE', 'The AI service is unavailable. Check server configuration and try again.');
  }
  return new AppError(500, 'REQUEST_FAILED', 'Something went wrong. Please try again.');
}
