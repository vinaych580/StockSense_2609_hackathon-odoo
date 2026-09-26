import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { isApiError } from './api';

interface FieldIssue {
  path: string;
  message: string;
}

function fieldIssues(details: unknown): FieldIssue[] {
  if (!Array.isArray(details)) return [];
  return details.filter(
    (d): d is FieldIssue => typeof d?.path === 'string' && d.path !== '' && typeof d?.message === 'string',
  );
}

/**
 * Puts a failed request's error onto a React Hook Form form: VALIDATION_FAILED becomes field errors,
 * anything else becomes `root.server` for an inline alert. Returns the ApiError code, if any.
 */
export function applyServerError<T extends FieldValues>(setError: UseFormSetError<T>, err: unknown) {
  if (!isApiError(err)) {
    setError('root.server', { message: 'Something went wrong. Try again.' });
    return undefined;
  }
  const issues = err.error.code === 'VALIDATION_FAILED' ? fieldIssues(err.error.details) : [];
  if (issues.length > 0) {
    for (const issue of issues) setError(issue.path as Path<T>, { message: issue.message });
  } else {
    setError('root.server', { message: err.error.message });
  }
  return err.error.code;
}
