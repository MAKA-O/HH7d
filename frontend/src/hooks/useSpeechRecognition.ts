/** Хук над Web Speech API: диктовка ответа на русском (ru-RU) с аккуратным fallback. */
import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSpeechRecognitionOptions {
  lang?: string
  /** Вызывается с распознанным финальным фрагментом речи. */
  onTranscript?: (text: string) => void
  /** Вызывается с человекочитаемым сообщением об ошибке. */
  onError?: (message: string) => void
}

interface UseSpeechRecognitionResult {
  /** Поддерживает ли браузер распознавание речи. */
  supported: boolean
  listening: boolean
  /** Промежуточный (ещё не финальный) текст — для живого отображения. */
  interim: string
  error: string | null
  start: () => void
  stop: () => void
  toggle: () => void
}

function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Доступ к микрофону запрещён. Разрешите его в настройках браузера или надиктуйте ответ вручную.'
    case 'no-speech':
      return 'Речь не распознана. Попробуйте ещё раз — говорите чуть громче и ближе к микрофону.'
    case 'audio-capture':
      return 'Микрофон не найден. Проверьте, что он подключён и не занят другим приложением.'
    case 'network':
      return 'Распознавание речи недоступно: нет связи с сервисом браузера. Введите ответ текстом.'
    case 'aborted':
      return ''
    default:
      return 'Не удалось распознать речь. Попробуйте ещё раз или введите ответ текстом.'
  }
}

export function useSpeechRecognition({
  lang = 'ru-RU',
  onTranscript,
  onError,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const [supported] = useState(
    () => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
  )
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptHandler = useRef(onTranscript)
  const errorHandler = useRef(onError)

  useEffect(() => {
    transcriptHandler.current = onTranscript
    errorHandler.current = onError
  }, [onTranscript, onError])

  useEffect(
    () => () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
    },
    [],
  )

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!supported) {
      const message = 'Браузер не поддерживает распознавание речи. Введите ответ текстом или откройте страницу в Chrome/Edge.'
      setError(message)
      errorHandler.current?.(message)
      return
    }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) return

    recognitionRef.current?.abort()
    const recognition = new Recognition()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setListening(true)
      setError(null)
      setInterim('')
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const alternative = result?.[0]
        if (!alternative) continue
        if (result.isFinal) finalText += alternative.transcript
        else interimText += alternative.transcript
      }
      setInterim(interimText)
      if (finalText.trim()) {
        setInterim('')
        transcriptHandler.current?.(finalText.trim())
      }
    }

    recognition.onerror = (event) => {
      setListening(false)
      setInterim('')
      const message = speechErrorMessage(event.error)
      if (!message) return
      setError(message)
      errorHandler.current?.(message)
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setListening(false)
    }
  }, [lang, supported])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  return { supported, listening, interim, error, start, stop, toggle }
}
