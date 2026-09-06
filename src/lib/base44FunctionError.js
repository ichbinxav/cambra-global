export function base44FunctionErrorPayload(error) {
  const candidates = [
    error?.data?.data,
    error?.data,
    error?.response?.data?.data,
    error?.response?.data,
    error?.originalError?.response?.data?.data,
    error?.originalError?.response?.data,
    error?.cause?.data?.data,
    error?.cause?.data,
    error,
  ];

  return candidates.find((candidate) => (
    candidate
    && typeof candidate === "object"
    && !Array.isArray(candidate)
    && (candidate.ok === false || candidate.error || candidate.blockers)
  )) || null;
}

export function normalizeBase44FunctionError(error, fallback = "Operation failed") {
  const data = base44FunctionErrorPayload(error);
  return Object.assign(new Error(data?.error || error?.message || fallback), {
    data: data || {},
    status: error?.status
      || error?.response?.status
      || error?.originalError?.response?.status
      || error?.cause?.status,
  });
}
