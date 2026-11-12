/**
 * Direct OpenAI API implementation using fetch
 * Bypasses OpenAI SDK issues in React Native
 */

interface ChatCompletionMessage {
  role: "user" | "assistant" | "system";
  content: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> | string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  max_tokens: number;
  temperature: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Call OpenAI Chat Completions API directly using fetch
 */
export const callOpenAIChat = async (
  request: ChatCompletionRequest,
  timeoutMs: number = 60000
): Promise<ChatCompletionResponse> => {
  const apiKey = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;

  if (!apiKey) {
    console.error("[OpenAI] API key not found! EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY is undefined");
    throw new Error("OpenAI API key not found in environment variables");
  }

  // Log that we have a key (but not the key itself)
  console.log("[OpenAI] API key found, length:", apiKey.length);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");

      // Handle specific error codes with user-friendly messages
      if (response.status === 502) {
        throw new Error("OpenAI service is temporarily unavailable. Please try again in a moment.");
      } else if (response.status === 503) {
        throw new Error("OpenAI service is under heavy load. Please try again in a few seconds.");
      } else if (response.status === 429) {
        throw new Error("Too many requests. Please wait a moment and try again.");
      } else if (response.status === 401) {
        throw new Error("API configuration error. Please check your settings.");
      } else if (response.status >= 500) {
        throw new Error("OpenAI server error. Please try again in a moment.");
      }

      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      throw new Error("Request timed out. Please check your internet connection and try again.");
    }

    // If error already has a user-friendly message, rethrow it
    if (error.message &&
        (error.message.includes("temporarily unavailable") ||
         error.message.includes("under heavy load") ||
         error.message.includes("Too many requests") ||
         error.message.includes("configuration error") ||
         error.message.includes("server error") ||
         error.message.includes("timed out"))) {
      throw error;
    }

    // Network errors
    if (error.message && error.message.includes("Network request failed")) {
      throw new Error("Network error. Please check your internet connection and try again.");
    }

    throw error;
  }
};
