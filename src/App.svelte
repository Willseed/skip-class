<script lang="ts">
  import { buildLearningUrl } from './modules/api';
  import { buildAuthorizationHeader } from './modules/auth';
  import { validateForm } from './modules/validation';
  import type { FieldErrors, FormValues, ValidationResult } from './modules/validation';
  import { createPreviewDocument } from './modules/preview';
  import {
    buildRequestPreviewData,
    extractQualifiedActivities,
    runWatchBatch,
  } from './modules/watch';
  import type { QualifiedActivity, WatchBatchSummary, WatchResponse } from './modules/watch';

  const API_BASE_URL =
    typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim().replace(/\/+$/, '')
      : '';
  const ENABLE_PREVIEW_PANES = import.meta.env.VITE_ENABLE_PREVIEW_PANES === 'true';
  const WATCH_POST_INTERVAL_MS_MIN = 1000;
  const WATCH_POST_INTERVAL_MS_MAX = 3000;
  const API_BASE_URL_ERROR =
    '缺少設定：請在 .env.local 設定 VITE_API_BASE_URL（發送保護網址），例如 https://your-api-host.example.com/path';

  let classId = '';
  let authToken = '';

  let validationErrors: string[] = [];
  let fieldErrors: FieldErrors = {};
  let hasFailedValidationAttempt = false;
  let requestError = '';
  let requestSuccess = '';
  let eligibleActivities: QualifiedActivity[] = [];
  let watchResponses: WatchResponse[] = [];
  let watchBatchSummary: WatchBatchSummary | null = null;
  let isSubmitting = false;
  let requestPreviewText: string;
  let sandboxPreviewDoc: string;

  const applyValidation = (values: FormValues): ValidationResult => {
    const result = validateForm(values);
    validationErrors = result.errors;
    fieldErrors = result.fieldErrors;
    return result;
  };

  $: if (ENABLE_PREVIEW_PANES) {
    const requestPreview = buildRequestPreviewData({
      apiBaseUrl: API_BASE_URL,
      classId,
      authToken,
      eligibleActivities,
    });
    requestPreviewText = JSON.stringify(requestPreview, null, 2);
    sandboxPreviewDoc = createPreviewDocument(requestPreviewText);
  } else {
    requestPreviewText = '';
    sandboxPreviewDoc = '';
  }

  $: if (hasFailedValidationAttempt) {
    applyValidation({ classId, authToken });
  }

  const submitRequest = async (): Promise<void> => {
    if (isSubmitting) {
      return;
    }

    const values: FormValues = { classId, authToken };
    const { errors } = applyValidation(values);
    hasFailedValidationAttempt = errors.length > 0;
    requestError = '';
    requestSuccess = '';
    eligibleActivities = [];
    watchResponses = [];
    watchBatchSummary = null;

    if (!API_BASE_URL) {
      requestError = API_BASE_URL_ERROR;
      return;
    }

    if (validationErrors.length > 0) {
      return;
    }

    isSubmitting = true;

    try {
      const trimmedClassId = values.classId.trim();
      const authorizationHeader = buildAuthorizationHeader(values.authToken);
      const learningResponse = await fetch(buildLearningUrl(API_BASE_URL, trimmedClassId), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: authorizationHeader,
        },
      });
      const learningResponseBody = await learningResponse.text();

      if (!learningResponse.ok) {
        requestError = `取得 learning 資料失敗（HTTP ${learningResponse.status}）。請確認課程ID與 Token。`;
        return;
      }

      let learningPayload: unknown;
      try {
        learningPayload = learningResponseBody ? JSON.parse(learningResponseBody) : null;
      } catch {
        requestError = '取得 learning 資料成功，但回應不是有效 JSON。';
        return;
      }

      const activities = extractQualifiedActivities(learningPayload);
      eligibleActivities = activities;

      if (activities.length === 0) {
        requestError = '找不到可送出的 learning activity：需具備 material 且 material.duration 為數字。';
        return;
      }

      const batchResult = await runWatchBatch({
        apiBaseUrl: API_BASE_URL,
        classId: trimmedClassId,
        authToken: values.authToken,
        activities,
        intervalMinMs: WATCH_POST_INTERVAL_MS_MIN,
        intervalMaxMs: WATCH_POST_INTERVAL_MS_MAX,
      });

      watchResponses = batchResult.responses;
      watchBatchSummary = batchResult.summary;
      if (batchResult.successMessage) {
        requestSuccess = batchResult.successMessage;
      }
    } catch (error: unknown) {
      requestError = `送出失敗：${error instanceof Error ? error.message : '未知錯誤'}`;
    } finally {
      isSubmitting = false;
    }
  };
</script>


<main>
  <section class="tool-card" class:tool-card-submitting={isSubmitting} inert={isSubmitting} aria-busy={isSubmitting}>
    <h1>Watch API 填寫工具</h1>
    <p class="description">
      輸入課程ID與 Token 後按「送出」，工具會先取得 learning 清單，再依符合條件的 learning activity 逐筆先送出 start、再送出 watch request。
    </p>
    {#if !API_BASE_URL}
      <div class="message error">{API_BASE_URL_ERROR}</div>
    {/if}

    <form on:submit|preventDefault={submitRequest} class="form-block" aria-disabled={isSubmitting}>
      <fieldset disabled={isSubmitting}>
        <legend>1. API 路徑</legend>
        <label>
          課程ID(class)
          <input bind:value={classId} placeholder="例如 594" autocomplete="off" class={fieldErrors.classId ? 'input-error' : ''} />
          {#if fieldErrors.classId}
            <span class="field-error">{fieldErrors.classId}</span>
          {/if}
        </label>
      </fieldset>

      <fieldset disabled={isSubmitting}>
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
        {#if isSubmitting}
          <span class="clock-spinner" aria-hidden="true">🕒</span>
          <span>送出中…</span>
        {:else}
          取得 learning 並送出 watch requests
        {/if}
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
            {#if result.error}
              <p class="watch-meta watch-error">錯誤：{result.error}</p>
            {/if}
            <pre>{result.body || '(空白回應)'}</pre>
          </article>
        {/each}
      </section>
    {/if}
  </section>
  {#if isSubmitting}
    <div class="submitting-overlay" role="status" aria-live="polite" aria-atomic="true">
      <div class="submitting-panel">
        <span class="clock-spinner submitting-clock" aria-hidden="true">🕒</span>
        <div>
          <p class="submitting-title">送出中，請稍候…</p>
          <p class="submitting-description">系統正在逐筆送出 start / watch request，期間已暫時鎖定頁面操作。</p>
        </div>
      </div>
    </div>
  {/if}
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

  .tool-card-submitting {
    pointer-events: none;
    user-select: none;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
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

  .clock-spinner {
    display: inline-flex;
    line-height: 1;
    animation: clockSpin 1s linear infinite;
  }

  .submitting-overlay {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(15, 23, 42, 0.38);
  }

  .submitting-panel {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    width: min(560px, 100%);
    padding: 1rem 1.1rem;
    border-radius: 0.9rem;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    color: #0f172a;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.22);
  }

  .submitting-clock {
    font-size: 1.8rem;
  }

  .submitting-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .submitting-description {
    margin: 0.3rem 0 0;
    font-size: 0.92rem;
    color: #1e293b;
    line-height: 1.45;
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

  @keyframes clockSpin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
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
