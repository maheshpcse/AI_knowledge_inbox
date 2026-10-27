// Run the request and minimum loading period together, not one after the other.
// All loading views stay visible for max(300 ms, request duration), even on errors.
export async function api(path, body) {
  const minimumLoading = new Promise(resolve => setTimeout(resolve, 300));
  try {
    return await request(path, body);
  } finally {
    await minimumLoading;
  }
}

async function request(path, body) {
  let response;
  try { response = await fetch(`/api${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); }
  catch { throw new Error('Could not reach the server. Check your connection and try again.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('The server returned an unexpected response. Please try again.'); }
  if (!response.ok) throw new Error(data.error?.message || 'The request failed. Please try again.');
  return data;
}
