import Ably from "ably/promises";

let restClient: Ably.Types.RestPromise | null = null;

export function getAblyRest(): Ably.Types.RestPromise {
  if (!restClient) {
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
      throw new Error("ABLY_API_KEY is not set");
    }
    restClient = new Ably.Rest(apiKey);
  }
  return restClient;
}
