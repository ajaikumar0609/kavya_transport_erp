/**
 * Open a document URL in a new tab.
 * For S3 URLs, does a HEAD pre-check and shows a toast if the file is missing.
 * Chrome blocks navigation to data: URLs via <a target="_blank"> or window.open,
 * showing a black screen. This converts them to Blob URLs first.
 */
export function openDocumentUrl(fileUrl: string | null | undefined): void {
  if (!fileUrl) return;
  if (fileUrl.startsWith('data:')) {
    try {
      const [header, b64] = fileUrl.split(',');
      const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const tab = window.open(blobUrl, '_blank', 'noreferrer');
      if (tab) setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch {
      window.open(fileUrl, '_blank', 'noreferrer');
    }
  } else if (fileUrl.includes('X-Amz-') || fileUrl.includes('amazonaws.com')) {
    // Presigned S3 URLs are method-specific (GetObject) — HEAD returns 403.
    // The backend already validates the object exists before presigning, so open directly.
    window.open(fileUrl, '_blank', 'noreferrer');
  } else if (fileUrl.startsWith('/uploads/') || fileUrl.startsWith('/api/')) {
    // Local server file — must be served from the backend API, not the frontend domain.
    window.open(`https://api.kavyatransports.com${fileUrl}`, '_blank', 'noreferrer');
  } else {
    window.open(fileUrl, '_blank', 'noreferrer');
  }
}

export const safeArray = <T>(val: any): T[] => {
  if (Array.isArray(val)) return val;
  if (Array.isArray(val?.data)) return val.data;
  if (Array.isArray(val?.items)) return val.items;
  if (Array.isArray(val?.results)) return val.results;
  if (Array.isArray(val?.records)) return val.records;
  return [];
};
