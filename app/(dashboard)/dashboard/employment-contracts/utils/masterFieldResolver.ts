// Re-export from ecResolver — this module has been consolidated into
// ecResolver.ts which uses the shared processPlaceholderValue engine
// from tasks-requirements/utils/placeholderProcessors.ts.
// Kept only for backward compatibility with any external consumers.
export {
  resolveEcPlaceholderValues,
  resolveEcPlaceholderSingle,
  resolveEntityScope,
  saveEcMasterFieldValue,
  type EntityScope,
  type ResolveEcPlaceholderValuesResult,
} from './ecResolver';
