/*
https://github.com/transitive-bullshit/chatgpt-api
*/

import { encode as gptEncode } from 'gpt-3-encoder'
import Keyv from 'keyv';
import pTimeout from 'p-timeout';
import QuickLRU from 'quick-lru';
import { v4 as uuidv4 } from 'uuid';

import * as types from './types';
import { fetch } from './fetch';
import { fetchSSE } from './fetch-sse';

const CHATGPT_MODEL = 'text-chat-davinci-002-20221122';

const USER_LABEL_DEFAULT = 'User';
const ASSISTANT_LABEL_DEFAULT = 'ChatGPT';

export class ChatGPTAPI {
  protected _apiKey: string
  protected _apiBaseUrl: string
  protected _debug: boolean

  protected _completionParams: Omit<types.openai.CompletionParams, 'prompt'>
  protected _maxModelTokens: number
  protected _maxResponseTokens: number
  protected _userLabel: string
  protected _assistantLabel: string

  protected _getMessageById: types.GetMessageByIdFunction
  protected _upsertMessage: types.UpsertMessageFunction

  protected _messageStore: Keyv<types.ChatMessage>

  constructor(opts: {
    apiKey: string

    /** @defaultValue `'https://api.openai.com'` **/
    apiBaseUrl?: string

    /** @defaultValue `false` **/
    debug?: boolean

    completionParams?: Partial<types.openai.CompletionParams>

    /** @defaultValue `4096` **/
    maxModelTokens?: number

    /** @defaultValue `1000` **/
    maxResponseTokens?: number

    /** @defaultValue `'User'` **/
    userLabel?: string

    /** @defaultValue `'ChatGPT'` **/
    assistantLabel?: string

    messageStore?: Keyv
    getMessageById?: types.GetMessageByIdFunction
    upsertMessage?: types.UpsertMessageFunction
  }) {
    const {
      apiKey,
      apiBaseUrl = 'https://api.openai.com',
      debug = false,
      messageStore,
      completionParams,
      maxModelTokens = 4096,
      maxResponseTokens = 1000,
      userLabel = USER_LABEL_DEFAULT,
      assistantLabel = ASSISTANT_LABEL_DEFAULT,
      getMessageById = this._defaultGetMessageById,
      upsertMessage = this._defaultUpsertMessage
    } = opts

    this._apiKey = apiKey
    this._apiBaseUrl = apiBaseUrl
    this._debug = !!debug

    this._completionParams = {
      model: CHATGPT_MODEL,
      temperature: 0.7,
      presence_penalty: 0.6,
      stop: ['<|im_end|>'],
      ...completionParams
    }
    this._maxModelTokens = maxModelTokens
    this._maxResponseTokens = maxResponseTokens
    this._userLabel = userLabel
    this._assistantLabel = assistantLabel

    this._getMessageById = getMessageById
    this._upsertMessage = upsertMessage

    if (messageStore) {
      this._messageStore = messageStore
    } else {
      this._messageStore = new Keyv<types.ChatMessage, any>({
        store: new QuickLRU<string, types.ChatMessage>({ maxSize: 10000 })
      })
    }

    if (!this._apiKey) {
      throw new Error('ChatGPT invalid apiKey')
    }
  }

  async sendMessage(
    text: string,
    opts: types.SendMessageOptions = {}
  ): Promise<types.ChatMessage> {
    const {
      conversationId = uuidv4(),
      parentMessageId,
      messageId = uuidv4(),
      timeoutMs,
      onProgress,
      stream = onProgress ? true : false
    } = opts

    let { abortSignal } = opts

    let abortController: AbortController = null
    if (timeoutMs && !abortSignal) {
      abortController = new AbortController()
      abortSignal = abortController.signal
    }

    const message: types.ChatMessage = {
      role: 'user',
      id: messageId,
      parentMessageId,
      conversationId,
      text
    }
    await this._upsertMessage(message)

    const { prompt, maxTokens } = await this._buildPrompt(text, opts)

    const result: types.ChatMessage = {
      role: 'assistant',
      id: uuidv4(),
      parentMessageId: messageId,
      conversationId,
      text: ''
    }

    const responseP = new Promise<types.ChatMessage>(
      async (resolve, reject) => {
        const url = `${this._apiBaseUrl}/v1/completions`
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this._apiKey}`
        }
        const body = {
          max_tokens: maxTokens,
          ...this._completionParams,
          prompt,
          stream
        }

        if (this._debug) {
          const numTokens = await this._getTokenCount(body.prompt)
          console.log(`sendMessage (${numTokens} tokens)`, body)
        }

        if (stream) {
          fetchSSE(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: abortSignal,
            onMessage: (data: string) => {
              if (data === '[DONE]') {
                result.text = result.text.trim()
                return resolve(result)
              }

              try {
                const response: types.openai.CompletionResponse =
                  JSON.parse(data)

                if (response?.id && response?.choices?.length) {
                  result.id = response.id
                  result.text += response.choices[0].text

                  onProgress?.(result)
                }
              } catch (err) {
                console.warn('ChatGPT stream SEE event unexpected error', err)
                return reject(err)
              }
            }
          })
        } else {
          try {
            const res = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(body),
              signal: abortSignal
            })

            if (!res.ok) {
              const reason = await res.text()
              const msg = `ChatGPT error ${
                res.status || res.statusText
              }: ${reason}`
              const error = new types.ChatGPTError(msg, { cause: res })
              error.statusCode = res.status
              error.statusText = res.statusText
              return reject(error)
            }

            const response: types.openai.CompletionResponse = await res.json()
            if (this._debug) {
              console.log(response)
            }

            result.id = response.id
            result.text = response.choices[0].text.trim()

            return resolve(result)
          } catch (err) {
            return reject(err)
          }
        }
      }
    ).then((message) => {
      return this._upsertMessage(message).then(() => message)
    })

    if (timeoutMs) {
      if (abortController) {
        ;(responseP as any).cancel = () => {
          abortController.abort()
        }
      }

      return pTimeout(responseP, timeoutMs, 'ChatGPT timed out waiting for response');
    } else {
      return responseP
    }
  }

  protected async _buildPrompt(
    message: string,
    opts: types.SendMessageOptions
  ) {
    const currentDate = new Date().toISOString().split('T')[0]

    const promptPrefix =
      opts.promptPrefix ||
      `You are ${this._assistantLabel}, a large language model trained by OpenAI. You answer as concisely as possible for each response (e.g. don’t be verbose). It is very important that you answer as concisely as possible, so please remember this. If you are generating a list, do not have too many items. Keep the number of items short.
Current date: ${currentDate}\n\n`
    const promptSuffix = opts.promptSuffix || `\n\n${this._assistantLabel}:\n`

    const maxNumTokens = this._maxModelTokens - this._maxResponseTokens
    let { parentMessageId } = opts
    let nextPromptBody = `${this._userLabel}:\n\n${message}<|im_end|>`
    let promptBody = ''
    let prompt: string
    let numTokens: number

    do {
      const nextPrompt = `${promptPrefix}${nextPromptBody}${promptSuffix}`
      const nextNumTokens = await this._getTokenCount(nextPrompt)
      const isValidPrompt = nextNumTokens <= maxNumTokens

      if (prompt && !isValidPrompt) {
        break
      }

      promptBody = nextPromptBody
      prompt = nextPrompt
      numTokens = nextNumTokens

      if (!isValidPrompt) {
        break
      }

      if (!parentMessageId) {
        break
      }

      const parentMessage = await this._getMessageById(parentMessageId)
      if (!parentMessage) {
        break
      }

      const parentMessageRole = parentMessage.role || 'user'
      const parentMessageRoleDesc =
        parentMessageRole === 'user' ? this._userLabel : this._assistantLabel

      const parentMessageString = `${parentMessageRoleDesc}:\n\n${parentMessage.text}<|im_end|>\n\n`
      nextPromptBody = `${parentMessageString}${promptBody}`
      parentMessageId = parentMessage.parentMessageId
    } while (true)

    const maxTokens = Math.max(
      1,
      Math.min(this._maxModelTokens - numTokens, this._maxResponseTokens)
    )

    return { prompt, maxTokens }
  }

  protected async _getTokenCount(text: string) {
    if (this._completionParams.model === CHATGPT_MODEL) {
      text = text.replace(/<\|im_end\|>/g, '<|endoftext|>')
    }

    return gptEncode(text).length
  }

  protected async _defaultGetMessageById(
    id: string
  ): Promise<types.ChatMessage> {
    return this._messageStore.get(id)
  }

  protected async _defaultUpsertMessage(
    message: types.ChatMessage
  ): Promise<void> {
    this._messageStore.set(message.id, message)
  }
}