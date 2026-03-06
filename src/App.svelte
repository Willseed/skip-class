<script lang="ts">
  type FormValues = {
    classId: string
    activityId: string
    authToken: string
    lastViewTime: string
    playedStart: string
    playedEnd: string
    learningTime: string
  }

  type EndpointValues = Pick<FormValues, 'classId' | 'activityId'>
  type FieldErrors = Partial<Record<keyof FormValues, string>>
  type ValidationResult = {
    errors: string[]
    fieldErrors: FieldErrors
  }

  type WatchPayload = {
    last_view_time: number
    played: [[number, number]]
    learning_time: number
  }

  type PreviewNumber = number | '(未填寫)' | '(格式錯誤)'

  const API_BASE_URL =
    typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim().replace(/\/+$/, '')
      : ''
  const ENABLE_PREVIEW_PANES = import.meta.env.VITE_ENABLE_PREVIEW_PANES === 'true'
  const API_BASE_URL_ERROR =
    '缺少設定：請在 .env.local 設定 VITE_API_BASE_URL（發送保護網址），例如 https://your-api-host.example.com/path'

  let classId = ''
  let activityId = ''
  let authToken = ''
  let lastViewTime = ''
  let playedStart = ''
  let playedEnd = ''
  let learningTime = ''

  let validationErrors: string[] = []
  let fieldErrors: FieldErrors = {}
  let requestError = ''
  let requestSuccess = ''
  let responseStatus: number | null = null
  let responseBody = ''
  let isSubmitting = false
  let requestPreviewText: string
  let sandboxPreviewDoc: string

  const buildEndpointUrl = (values: EndpointValues, withPlaceholders = false): string => {
    const classIdPath = values.classId.trim()
      ? encodeURIComponent(values.classId.trim())
      : withPlaceholders
        ? '{classId}'
        : ''
    const activityIdPath = values.activityId.trim()
      ? encodeURIComponent(values.activityId.trim())
      : withPlaceholders
        ? '{activityId}'
        : ''

    return `${API_BASE_URL}/class/${classIdPath}/learning-activity/${activityIdPath}/watch`
  }

  const buildPayload = (values: FormValues): WatchPayload => ({
    last_view_time: Number(values.lastViewTime),
    played: [[Number(values.playedStart), Number(values.playedEnd)]],
    learning_time: Number(values.learningTime),
  })

  const toPreviewNumber = (value: string): PreviewNumber => {
    if (value === '') {
      return '(未填寫)'
    }

    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : '(格式錯誤)'
  }

  const escapeHtml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')

  const maskToken = (token: string): string => {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      return '(未輸入)'
    }
    if (trimmedToken.length <= 10) {
      return `${trimmedToken.slice(0, 2)}***`
    }
    return `${trimmedToken.slice(0, 6)}...${trimmedToken.slice(-4)}`
  }

  const createPreviewDocument = (previewText: string): string => `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <title>Request Preview</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 12px; margin: 0; color: #0f172a; }
      h2 { margin-top: 0; font-size: 16px; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; font-size: 12px; }
    </style>
  </head>
  <body>
    <h2>Sandbox Request Preview</h2>
    <pre>${escapeHtml(previewText)}</pre>
  </body>
</html>`

  const validateForm = (values: FormValues): ValidationResult => {
    const errors: string[] = []
    const nextFieldErrors: FieldErrors = {}
    const setFieldError = (field: keyof FormValues, message: string): void => {
      if (!nextFieldErrors[field]) {
        nextFieldErrors[field] = message
      }
    }

    if (!values.classId.trim()) {
      const message = '請輸入課程ID(class)。'
      errors.push(message)
      setFieldError('classId', message)
    }
    if (!values.activityId.trim()) {
      const message = '請輸入活動ID(learning-activity)。'
      errors.push(message)
      setFieldError('activityId', message)
    }
    if (!values.authToken.trim()) {
      const message = '請輸入授權 Token。'
      errors.push(message)
      setFieldError('authToken', message)
    }

    const numberFields: [keyof FormValues, string, string][] = [
      ['lastViewTime', '最後觀看時間(last_view_time)', values.lastViewTime],
      ['playedStart', '播放起始時間(played_start)', values.playedStart],
      ['playedEnd', '播放結束時間(played_end)', values.playedEnd],
      ['learningTime', '學習時間(learning_time)', values.learningTime],
    ]

    for (const [field, label, rawValue] of numberFields) {
      if (rawValue === '') {
        const message = `請輸入 ${label}。`
        errors.push(message)
        setFieldError(field, message)
        continue
      }
      const parsedValue = Number(rawValue)
      if (!Number.isInteger(parsedValue) || parsedValue < 0) {
        const message = `${label} 需為 0 以上整數。`
        errors.push(message)
        setFieldError(field, message)
      }
    }

    const start = Number(values.playedStart)
    const end = Number(values.playedEnd)
    const viewTime = Number(values.lastViewTime)
    if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
      const message = '播放結束時間(played_end)不可小於播放起始時間(played_start)。'
      errors.push(message)
      setFieldError('playedEnd', message)
    }
    if (Number.isFinite(viewTime) && Number.isFinite(end) && viewTime < end) {
      const message = '最後觀看時間(last_view_time)需大於或等於播放結束時間(played_end)。'
      errors.push(message)
      setFieldError('lastViewTime', message)
    }

    return { errors, fieldErrors: nextFieldErrors }
  }

  $: if (ENABLE_PREVIEW_PANES) {
    const requestPreview = {
      method: 'POST',
      url: buildEndpointUrl({ classId, activityId }, true),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${maskToken(authToken)}`,
      },
      body: {
        last_view_time: toPreviewNumber(lastViewTime),
        played: [[toPreviewNumber(playedStart), toPreviewNumber(playedEnd)]],
        learning_time: toPreviewNumber(learningTime),
      },
    }

    requestPreviewText = JSON.stringify(requestPreview, null, 2)
    sandboxPreviewDoc = createPreviewDocument(requestPreviewText)
  } else {
    requestPreviewText = ''
    sandboxPreviewDoc = ''
  }

  const submitRequest = async (): Promise<void> => {
    const values: FormValues = { classId, activityId, authToken, lastViewTime, playedStart, playedEnd, learningTime }
    const { errors, fieldErrors: nextFieldErrors } = validateForm(values)
    validationErrors = errors
    fieldErrors = nextFieldErrors

    requestError = ''
    requestSuccess = ''
    responseStatus = null
    responseBody = ''

    if (!API_BASE_URL) {
      requestError = API_BASE_URL_ERROR
      return
    }

    if (validationErrors.length > 0) {
      return
    }

    isSubmitting = true
    try {
      const response = await fetch(buildEndpointUrl(values), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${values.authToken.trim()}`,
        },
        body: JSON.stringify(buildPayload(values)),
      })

      responseStatus = response.status
      responseBody = await response.text()

      if (response.ok) {
        requestSuccess = '送出成功，伺服器已接收 watch 資料。'
      } else {
        requestError = `送出失敗（HTTP ${response.status}）。請確認 Token 和輸入值。`
      }
    } catch (error: unknown) {
      requestError = `送出失敗：${error instanceof Error ? error.message : '未知錯誤'}`
    } finally {
      isSubmitting = false
    }
  }
</script>

<main>
  <section class="tool-card">
    <h1>Watch API 填寫工具</h1>
    <p class="description">
      依照欄位填寫資料後按「送出」，工具會自動組出 API request。Token 請自行貼上，不會預設任何密鑰。
    </p>
    {#if !API_BASE_URL}
      <div class="message error">{API_BASE_URL_ERROR}</div>
    {/if}

    <form on:submit|preventDefault={submitRequest} class="form-block">
      <fieldset>
        <legend>1. API 路徑</legend>
        <div class="grid-fields">
          <label>
            課程ID(class)
            <input bind:value={classId} placeholder="例如 594" autocomplete="off" class={fieldErrors.classId ? 'input-error' : ''} />
            {#if fieldErrors.classId}
              <span class="field-error">{fieldErrors.classId}</span>
            {/if}
          </label>
          <label>
            活動ID(learning-activity)
            <input bind:value={activityId} placeholder="例如 2241" autocomplete="off" class={fieldErrors.activityId ? 'input-error' : ''} />
            {#if fieldErrors.activityId}
              <span class="field-error">{fieldErrors.activityId}</span>
            {/if}
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>2. 授權</legend>
        <label>
          Bearer Token（請貼上完整 Token）
          <input type="password" bind:value={authToken} placeholder="貼上使用者自己的 Token" autocomplete="off" class={fieldErrors.authToken ? 'input-error' : ''} />
          {#if fieldErrors.authToken}
            <span class="field-error">{fieldErrors.authToken}</span>
          {/if}
        </label>
      </fieldset>

      <fieldset>
        <legend>3. Payload內容</legend>
        <div class="grid-fields">
          <label>
            最後觀看時間(last_view_time)
            <input type="number" min="0" step="1" bind:value={lastViewTime} placeholder="例如 3130" class={fieldErrors.lastViewTime ? 'input-error' : ''} />
            {#if fieldErrors.lastViewTime}
              <span class="field-error">{fieldErrors.lastViewTime}</span>
            {/if}
          </label>
          <label>
            播放起始時間(played_start)
            <input type="number" min="0" step="1" bind:value={playedStart} placeholder="例如 3100" class={fieldErrors.playedStart ? 'input-error' : ''} />
            {#if fieldErrors.playedStart}
              <span class="field-error">{fieldErrors.playedStart}</span>
            {/if}
          </label>
          <label>
            播放結束時間(played_end)
            <input type="number" min="0" step="1" bind:value={playedEnd} placeholder="例如 3130" class={fieldErrors.playedEnd ? 'input-error' : ''} />
            {#if fieldErrors.playedEnd}
              <span class="field-error">{fieldErrors.playedEnd}</span>
            {/if}
          </label>
          <label>
            學習時間(learning_time)
            <input type="number" min="0" step="1" bind:value={learningTime} placeholder="例如 30" class={fieldErrors.learningTime ? 'input-error' : ''} />
            {#if fieldErrors.learningTime}
              <span class="field-error">{fieldErrors.learningTime}</span>
            {/if}
          </label>
        </div>
      </fieldset>

      {#if requestSuccess}
        <div class="message success">{requestSuccess}</div>
      {/if}
      {#if requestError}
        <div class="message error">{requestError}</div>
      {/if}

      <button type="submit" disabled={isSubmitting || !API_BASE_URL}>
        {isSubmitting ? '送出中…' : '送出 watch request'}
      </button>
    </form>

    {#if ENABLE_PREVIEW_PANES}
      <section class="preview-block">
        <h2>Request 預覽</h2>
        <pre>{requestPreviewText}</pre>
        <p class="preview-note">
          下方 iframe 使用嚴格 sandbox（無任何額外權限）顯示預覽內容，用來隔離使用者輸入與頁面主環境，降低 XSS 風險。
        </p>
        <iframe title="Sandboxed request preview" sandbox="" srcdoc={sandboxPreviewDoc}></iframe>
      </section>
    {/if}

    {#if responseStatus !== null}
      <section class="response-block">
        <h2>伺服器回應（HTTP {responseStatus}）</h2>
        <pre>{responseBody || '(空白回應)'}</pre>
      </section>
    {/if}
  </section>
</main>

<style>
  main {
    min-height: 100vh;
    padding: 2rem 1rem;
    background: #f1f5f9;
    color: #0f172a;
  }

  h1,
  h2 {
    margin: 0;
  }

  .tool-card {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.5rem;
    border-radius: 1rem;
    background: #fff;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
  }

  .description {
    margin-top: 0.75rem;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .form-block,
  .preview-block,
  .response-block {
    margin-top: 1.25rem;
  }

  fieldset {
    border: 1px solid #cbd5e1;
    border-radius: 0.75rem;
    padding: 1rem;
    margin: 0;
  }

  fieldset + fieldset {
    margin-top: 1rem;
  }

  legend {
    font-weight: 700;
    padding: 0 0.5rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    font-size: 0.95rem;
    font-weight: 600;
  }

  input {
    border: 1px solid #94a3b8;
    border-radius: 0.5rem;
    padding: 0.6rem 0.7rem;
    font-size: 1rem;
    font-weight: 500;
  }

  .input-error {
    border: 1.5px solid #f87171;
    animation: fadeInOut 1.6s ease-in-out 1;
    background: #fef2f2;
  }

  .field-error {
    color: #b91c1c;
    font-size: 0.82rem;
    font-weight: 500;
    line-height: 1.35;
  }

  input:focus {
    outline: 2px solid #2563eb;
    outline-offset: 1px;
    border-color: #2563eb;
  }

  .grid-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.9rem;
  }

  button {
    margin-top: 1rem;
    border: none;
    border-radius: 0.6rem;
    background: #1d4ed8;
    color: #fff;
    padding: 0.65rem 1rem;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    background: #64748b;
  }

  .message {
    margin-top: 1rem;
    border-radius: 0.75rem;
    padding: 0.75rem 0.9rem;
  }

  .success {
    background: #dcfce7;
    border: 1px solid #86efac;
  }

  .error {
    background: #fee2e2;
    border: 1px solid #fca5a5;
  }

  @keyframes fadeInOut {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  pre {
    margin: 0.75rem 0 0;
    padding: 0.8rem;
    border-radius: 0.75rem;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .preview-note {
    margin-top: 0.75rem;
    font-size: 0.9rem;
    color: #334155;
  }

  iframe {
    width: 100%;
    min-height: 220px;
    margin-top: 0.75rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.75rem;
    background: #fff;
  }
</style>
