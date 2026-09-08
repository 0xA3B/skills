export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Creates a client for the upstream inventory API. `fetchImpl` is injectable for tests.
export function createApiClient({ baseUrl, fetchImpl = fetch }) {
  async function get(path) {
    const response = await fetchImpl(new URL(path, baseUrl));
    if (!response.ok) {
      throw new ApiError(response.status, `GET ${path} failed with ${response.status}`);
    }
    return response.json();
  }

  return { get };
}
