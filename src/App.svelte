<script lang="ts">
  type FormValues = {
    classId: string
    authToken: string
  }

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

  type QualifiedActivity = {
    id: string
    name: string
    duration: number
  }

  type WatchResponse = {
    activityId: string
    activityName: string
    duration: number
    endpoint: string
    status: number | null
    body: string
    ok: boolean
    error: string | null
  }

  type WatchBatchSummary = {
    total: number
    successCount: number
    failedCount: number
    status: 'all-success' | 'partial-success' | 'all-failed'
  }

  const API_BASE_URL =
    typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim().replace(/\/+$/, '')
      : ''
  const ENABLE_PREVIEW_PANES = import.meta.env.VITE_ENABLE_PREVIEW_PANES === 'true'
  const WATCH_REQUEST_DELAY_MS = 1000
  const WATCH_RANDOM_EXTRA_SECONDS_MIN = 10
  const WATCH_RANDOM_EXTRA_SECONDS_MAX = 30
  const API_BASE_URL_ERROR =
    '缺少設定：請在 .env.local 設定 VITE_API_BASE_URL（發送保護網址），例如 https://your-api-host.example.com/path'

  let classId = ''
  let authToken = ''

  let validationErrors: string[] = []
  let fieldErrors: FieldErrors = {}
  let hasFailedValidationAttempt = false
  let requestError = ''
  let requestSuccess = ''
  let learningFetchStatus: number | null = null
  let learningFetchBody = ''
  let eligibleActivities: QualifiedActivity[] = []
  let watchResponses: WatchResponse[] = []
  let watchBatchSummary: WatchBatchSummary | null = null
  let isSubmitting = false
  let requestPreviewText: string
  let sandboxPreviewDoc: string

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

  const buildLearningUrl = (classIdValue: string, withPlaceholders = false): string => {
    const classIdPath = classIdValue.trim()
      ? encodeURIComponent(classIdValue.trim())
      : withPlaceholders
        ? '{classId}'
        : ''

    return `${API_BASE_URL}/class/${classIdPath}/learning`
  }

  const buildWatchUrl = (classIdValue: string, activityIdValue: string, withPlaceholders = false): string => {
    const classIdPath = classIdValue.trim()
      ? encodeURIComponent(classIdValue.trim())
      : withPlaceholders
        ? '{classId}'
        : ''
    const activityIdPath = activityIdValue.trim()
      ? encodeURIComponent(activityIdValue.trim())
      : withPlaceholders
        ? '{activityId}'
        : ''

    return `${API_BASE_URL}/class/${classIdPath}/learning-activity/${activityIdPath}/watch`
  }

  const wait = async (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    })

  const getRandomIntInclusive = (min: number, max: number): number => {
    const normalizedMin = Math.ceil(min)
    const normalizedMax = Math.floor(max)
    return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin
  }

  const buildPayload = (duration: number, extraSeconds = 0): WatchPayload => {
    const safeDuration = Math.max(0, Math.floor(duration))
    const safeExtraSeconds = Math.max(0, Math.floor(extraSeconds))
    const passedSeconds = safeDuration + safeExtraSeconds

    return {
      last_view_time: passedSeconds,
      played: [[0, passedSeconds]],
      learning_time: passedSeconds,
    }
  }

  const buildRandomizedPayload = (duration: number): WatchPayload =>
    buildPayload(duration, getRandomIntInclusive(WATCH_RANDOM_EXTRA_SECONDS_MIN, WATCH_RANDOM_EXTRA_SECONDS_MAX))

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

    if (!values.authToken.trim()) {
      const message = '請輸入授權 Token。'
      errors.push(message)
      setFieldError('authToken', message)
    }

    return { errors, fieldErrors: nextFieldErrors }
  }

  const applyValidation = (values: FormValues): ValidationResult => {
    const result = validateForm(values)
    validationErrors = result.errors
    fieldErrors = result.fieldErrors
    return result
  }

  const extractQualifiedActivities = (payload: unknown): QualifiedActivity[] => {
    if (!isRecord(payload)) {
      return []
    }

    const data = payload.data
    if (!isRecord(data)) {
      return []
    }

    const units = data.units
    if (!Array.isArray(units)) {
      return []
    }

    const results: QualifiedActivity[] = []
    const seenActivityIds: Record<string, true> = {}

    for (const unit of units) {
      if (!isRecord(unit)) {
        continue
      }

      const learningActivities = unit.learning_activities
      if (!Array.isArray(learningActivities)) {
        continue
      }

      for (const learningActivity of learningActivities) {
        if (!isRecord(learningActivity)) {
          continue
        }

        const rawId = learningActivity.id
        if (typeof rawId !== 'string' && typeof rawId !== 'number') {
          continue
        }

        const activityId = String(rawId).trim()
        if (!activityId || seenActivityIds[activityId]) {
          continue
        }

        const material = learningActivity.material
        if (!isRecord(material)) {
          continue
        }

        const rawDuration = material.duration
        if (typeof rawDuration !== 'number' || !Number.isFinite(rawDuration) || rawDuration < 0) {
          continue
        }

        const duration = Math.floor(rawDuration)
        const rawName = learningActivity.learning_activity_name
        const activityName =
          typeof rawName === 'string' && rawName.trim().length > 0 ? rawName.trim() : `活動 ${activityId}`

        seenActivityIds[activityId] = true
        results.push({
          id: activityId,
          name: activityName,
          duration,
        })
      }
    }

    return results
  }

  $: if (ENABLE_PREVIEW_PANES) {
    const postPreviewEntries =
      eligibleActivities.length > 0
        ? eligibleActivities.map((activity) => ({
            activity_id: activity.id,
            request: {
              method: 'POST',
              url: buildWatchUrl(classId, activity.id),
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${maskToken(authToken)}`,
              },
              body: {
                last_view_time: `${activity.duration} + random(${WATCH_RANDOM_EXTRA_SECONDS_MIN}~${WATCH_RANDOM_EXTRA_SECONDS_MAX})`,
                played: [
                  [0, `${activity.duration} + random(${WATCH_RANDOM_EXTRA_SECONDS_MIN}~${WATCH_RANDOM_EXTRA_SECONDS_MAX})`],
                ],
                learning_time: `${activity.duration} + random(${WATCH_RANDOM_EXTRA_SECONDS_MIN}~${WATCH_RANDOM_EXTRA_SECONDS_MAX})`,
              },
            },
          }))
        : [
            {
              activity_id: '{learningActivityId}',
              request: {
                method: 'POST',
                url: buildWatchUrl(classId, '', true),
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${maskToken(authToken)}`,
                },
                body: {
                  last_view_time: `(material.duration + random(${WATCH_RANDOM_EXTRA_SECONDS_MIN}~${WATCH_RANDOM_EXTRA_SECONDS_MAX}))`,
                  played: [[0, `(material.duration + random(${WATCH_RANDOM_EXTRA_SECONDS_MIN}~${WATCH_RANDOM_EXTRA_SECONDS_MAX}))`]],
                  learning_time: `(material.duration + random(${WATCH_RANDOM_EXTRA_SECONDS_MIN}~${WATCH_RANDOM_EXTRA_SECONDS_MAX}))`,
                },
              },
            },
          ]

    const requestPreview = {
      step1_get_learning: {
        method: 'GET',
        url: buildLearningUrl(classId, true),
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${maskToken(authToken)}`,
        },
      },
      step2_post_watch_requests: postPreviewEntries,
    }

    requestPreviewText = JSON.stringify(requestPreview, null, 2)
    sandboxPreviewDoc = createPreviewDocument(requestPreviewText)
  } else {
    requestPreviewText = ''
    sandboxPreviewDoc = ''
  }

  $: if (hasFailedValidationAttempt) {
    applyValidation({ classId, authToken })
  }

  const submitRequest = async (): Promise<void> => {
    const values: FormValues = { classId, authToken }
    const { errors } = applyValidation(values)
    hasFailedValidationAttempt = errors.length > 0

    requestError = ''
    requestSuccess = ''
    learningFetchStatus = null
    learningFetchBody = ''
    eligibleActivities = []
    watchResponses = []
    watchBatchSummary = null

    if (!API_BASE_URL) {
      requestError = API_BASE_URL_ERROR
      return
    }

    if (validationErrors.length > 0) {
      return
    }

    isSubmitting = true
    try {
      const trimmedClassId = values.classId.trim()
      const trimmedToken = values.authToken.trim()

      const learningResponse = await fetch(buildLearningUrl(trimmedClassId), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${trimmedToken}`,
        },
      })

      learningFetchStatus = learningResponse.status
      learningFetchBody = await learningResponse.text()

      if (!learningResponse.ok) {
        requestError = `取得 learning 資料失敗（HTTP ${learningResponse.status}）。請確認課程ID與 Token。`
        return
      }

      let learningPayload: unknown
      try {
        learningPayload = learningFetchBody ? JSON.parse(learningFetchBody) : null
      } catch {
        requestError = '取得 learning 資料成功，但回應不是有效 JSON。'
        return
      }

      const activities = extractQualifiedActivities(learningPayload)
      eligibleActivities = activities

      if (activities.length === 0) {
        requestError = '找不到可送出的 learning activity：需具備 material 且 material.duration 為數字。'
        return
      }

      const results: WatchResponse[] = []
      for (const activity of activities) {
        const endpoint = buildWatchUrl(trimmedClassId, activity.id)
        await wait(WATCH_REQUEST_DELAY_MS)

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${trimmedToken}`,
            },
            body: JSON.stringify(buildRandomizedPayload(activity.duration)),
          })

          const responseText = await response.text()
          results.push({
            activityId: activity.id,
            activityName: activity.name,
            duration: activity.duration,
            endpoint,
            status: response.status,
            body: responseText,
            ok: response.ok,
            error: null,
          })
        } catch (error: unknown) {
          results.push({
            activityId: activity.id,
            activityName: activity.name,
            duration: activity.duration,
            endpoint,
            status: null,
            body: '',
            ok: false,
            error: error instanceof Error ? error.message : '未知錯誤',
          })
        }
      }

      watchResponses = results

      const successCount = results.filter((result) => result.ok).length
      const failedCount = results.length - successCount
      watchBatchSummary = {
        total: results.length,
        successCount,
        failedCount,
        status: failedCount === 0 ? 'all-success' : successCount === 0 ? 'all-failed' : 'partial-success',
      }

      if (failedCount === 0) {
        requestSuccess = `已完成送出，共 ${successCount} 筆 watch request 全部成功。`
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
      輸入課程ID與 Token 後按「送出」，工具會先取得 learning 清單，再依符合條件的 learning activity 自動逐筆送出 watch request。
    </p>
    {#if !API_BASE_URL}
      <div class="message error">{API_BASE_URL_ERROR}</div>
    {/if}

    <form on:submit|preventDefault={submitRequest} class="form-block">
      <fieldset>
        <legend>1. API 路徑</legend>
        <label>
          課程ID(class)
          <input bind:value={classId} placeholder="例如 594" autocomplete="off" class={fieldErrors.classId ? 'input-error' : ''} />
          {#if fieldErrors.classId}
            <span class="field-error">{fieldErrors.classId}</span>
          {/if}
        </label>
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

      {#if requestSuccess}
        <div class="message success">{requestSuccess}</div>
      {/if}
      {#if requestError}
        <div class="message error">{requestError}</div>
      {/if}

      <button type="submit" disabled={isSubmitting || !API_BASE_URL}>
        {isSubmitting ? '送出中…' : '取得 learning 並送出 watch requests'}
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

    {#if eligibleActivities.length > 0}
      <section class="activity-block">
        <h2>符合條件的 learning activity（{eligibleActivities.length}）</h2>
        <ul class="activity-list">
          {#each eligibleActivities as activity (activity.id)}
            <li>
              <strong>#{activity.id}</strong>
              <span>{activity.name}</span>
              <span>duration: {activity.duration}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if learningFetchStatus !== null}
      <section class="response-block">
        <h2>Learning API 回應（HTTP {learningFetchStatus}）</h2>
        <pre>{learningFetchBody || '(空白回應)'}</pre>
      </section>
    {/if}

    {#if watchResponses.length > 0}
      <section class="response-block">
        <h2>多筆發出資訊</h2>
        {#if watchBatchSummary}
          <p
            class="batch-summary"
            class:batch-summary-success={watchBatchSummary.status === 'all-success'}
            class:batch-summary-partial={watchBatchSummary.status === 'partial-success'}
            class:batch-summary-failed={watchBatchSummary.status === 'all-failed'}
          >
            總筆數 {watchBatchSummary.total} 筆｜成功 {watchBatchSummary.successCount} 筆｜失敗 {watchBatchSummary.failedCount} 筆
          </p>
          {#if watchBatchSummary.status === 'all-success'}
            <p class="batch-summary-note">所有 watch request 已完成且皆成功。</p>
          {:else if watchBatchSummary.status === 'all-failed'}
            <p class="batch-summary-note">全部 watch request 皆失敗，請查看下方回應明細。</p>
          {:else}
            <p class="batch-summary-note">部分 watch request 失敗，請查看下方回應明細。</p>
          {/if}
        {/if}
      </section>

      <section class="response-block">
        <h2>Watch API 回應（共 {watchResponses.length} 筆）</h2>
        {#each watchResponses as result (result.activityId)}
          <article class="watch-result" class:watch-result-success={result.ok} class:watch-result-error={!result.ok}>
            <h3>
              活動 #{result.activityId} - {result.activityName}
            </h3>
            <p class="watch-meta">
              duration: {result.duration} / {result.status === null ? '未取得 HTTP 狀態' : `HTTP ${result.status}`}
            </p>
            <p class="watch-meta">URL：{result.endpoint}</p>
            {#if result.error}
              <p class="watch-meta watch-error">錯誤：{result.error}</p>
            {/if}
            <pre>{result.body || '(空白回應)'}</pre>
          </article>
        {/each}
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
  h2,
  h3 {
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
  .activity-block,
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

  .activity-list {
    margin: 0.75rem 0 0;
    padding-left: 1.2rem;
    display: grid;
    gap: 0.45rem;
  }

  .activity-list li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .watch-result {
    margin-top: 0.85rem;
    padding: 0.8rem;
    border-radius: 0.75rem;
    border: 1px solid #cbd5e1;
    background: #f8fafc;
  }

  .batch-summary {
    margin-top: 0.75rem;
    border-radius: 0.75rem;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #1e3a8a;
    font-weight: 700;
    padding: 0.75rem 0.9rem;
  }

  .batch-summary-success {
    border-color: #86efac;
    background: #dcfce7;
    color: #166534;
  }

  .batch-summary-partial {
    border-color: #facc15;
    background: #fefce8;
    color: #854d0e;
  }

  .batch-summary-failed {
    border-color: #fca5a5;
    background: #fef2f2;
    color: #b91c1c;
  }

  .batch-summary-note {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
    color: #334155;
  }

  .watch-result-success {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .watch-result-error {
    border-color: #fca5a5;
    background: #fef2f2;
  }

  .watch-meta {
    margin: 0.45rem 0 0;
    font-size: 0.9rem;
    color: #334155;
  }

  .watch-error {
    color: #b91c1c;
    font-weight: 600;
  }
</style>
