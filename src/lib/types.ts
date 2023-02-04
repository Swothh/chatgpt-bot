/*
https://github.com/transitive-bullshit/chatgpt-api
*/

export type Role = 'user' | 'assistant'

export type SendMessageOptions = {
  conversationId?: string
  parentMessageId?: string
  messageId?: string
  stream?: boolean
  promptPrefix?: string
  promptSuffix?: string
  timeoutMs?: number
  onProgress?: (partialResponse: ChatMessage) => void
  abortSignal?: AbortSignal
}

export interface ChatMessage {
  id: string
  text: string
  role: Role
  parentMessageId?: string
  conversationId?: string
}

export class ChatGPTError extends Error {
  statusCode?: number
  statusText?: string
}

/** Returns a chat message from a store by it's ID (or null if not found). */
export type GetMessageByIdFunction = (id: string) => Promise<ChatMessage>

/** Upserts a chat message to a store. */
export type UpsertMessageFunction = (message: ChatMessage) => Promise<void>

export namespace openai {
  export type CompletionParams = {
    model: string
    prompt: string
    suffix?: string
    max_tokens?: number
    temperature?: number
    top_p?: number
    logprobs?: number
    echo?: boolean
    stop?: string[]
    presence_penalty?: number
    frequency_penalty?: number
    best_of?: number
    logit_bias?: Record<string, number>
    user?: string
  }

  export type CompletionResponse = {
    id: string
    object: string
    created: number
    model: string
    choices: CompletionResponseChoices
    usage?: CompletionResponseUsage
  }

  export type CompletionResponseChoices = {
    text?: string
    index?: number
    logprobs?: {
      tokens?: Array<string>
      token_logprobs?: Array<number>
      top_logprobs?: Array<object>
      text_offset?: Array<number>
    } | null
    finish_reason?: string
  }[]

  export type CompletionResponseUsage = {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}