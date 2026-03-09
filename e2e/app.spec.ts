import { expect, test } from '@playwright/test'

const WATCH_SUBMISSION_TIMEOUT_MS = 30_000

test('shows the watch api tool heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Watch API 填寫工具' })).toBeVisible()
})

test('uses auto-generated watch payload flow without manual payload fields', async ({ page }) => {
  await page.goto('/')

  const form = page.locator('form')
  await expect(form.locator('fieldset')).toHaveCount(2)
  await expect(form.getByRole('spinbutton')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '取得 learning 並送出 watch requests' })).toBeVisible()
})

test('shows inline field errors, clears corrected field errors immediately, and no global validation summary', async ({ page }) => {
  await page.goto('/')

  const classIdInput = page.getByPlaceholder('例如 594')
  const authTokenInput = page.getByPlaceholder('貼上使用者自己的 Token')

  await classIdInput.fill('')
  await authTokenInput.fill('')

  await page.getByRole('button', { name: '取得 learning 並送出 watch requests' }).click()

  await expect(page.locator('.validation-error')).toHaveCount(0)
  await expect(page.getByText('請先修正以下問題：')).toHaveCount(0)

  await expect(classIdInput).toHaveClass(/input-error/)
  await expect(authTokenInput).toHaveClass(/input-error/)

  const classIdField = page.locator('label', { has: classIdInput })
  const authTokenField = page.locator('label', { has: authTokenInput })

  await expect(classIdField.getByText('請輸入課程ID(class)。')).toBeVisible()
  await expect(authTokenField.getByText('請輸入授權 Token。')).toBeVisible()

  await classIdInput.fill('594')
  await expect(classIdInput).not.toHaveClass(/input-error/)
  await expect(classIdField.getByText('請輸入課程ID(class)。')).toHaveCount(0)
  await expect(authTokenInput).toHaveClass(/input-error/)

  await authTokenInput.fill('test-token-value')
  await expect(authTokenInput).not.toHaveClass(/input-error/)
  await expect(authTokenField.getByText('請輸入授權 Token。')).toHaveCount(0)
})

test('runs input-error animation once instead of infinitely for invalid fields', async ({ page }) => {
  await page.goto('/')

  const requiredInputs = [page.getByPlaceholder('例如 594'), page.getByPlaceholder('貼上使用者自己的 Token')]

  for (const input of requiredInputs) {
    await input.fill('')
  }

  await page.getByRole('button', { name: '取得 learning 並送出 watch requests' }).click()

  for (const input of requiredInputs) {
    await expect(input).toHaveClass(/input-error/)

    const animationName = await input.evaluate((node) => window.getComputedStyle(node).animationName)
    const animationIterationCount = await input.evaluate(
      (node) => window.getComputedStyle(node).animationIterationCount,
    )

    expect(animationName).not.toBe('none')
    expect(animationIterationCount).not.toBe('infinite')

    const numericIterationCount = Number.parseFloat(animationIterationCount)
    expect(Number.isFinite(numericIterationCount)).toBe(true)
    expect(numericIterationCount).toBeGreaterThan(0)
    expect(numericIterationCount).toBeLessThanOrEqual(1)
  }
})

test('gets learning first, then sends watch requests for each qualifying activity', async ({ page }) => {
  test.setTimeout(45_000)
  await page.goto('/')

  const requestMethods: string[] = []
  const expectedQualifiedActivityIds = ['671', '672', '675']
  const learningRequests: Array<{ url: string; authorization: string | undefined }> = []
  const startRequests: Array<{
    url: string
    authorization: string | undefined
    activityId: string | null
    requestedAt: number
  }> = []
  const watchRequests: Array<{
    url: string
    authorization: string | undefined
    activityId: string | null
    body: unknown
    requestedAt: number
  }> = []
  let activeWatchRequests = 0
  let maxConcurrentWatchRequests = 0
  const firstWatchRequestMaxDelayMs = 2_000
  const mockedWatchResponseDelayMs = 200
  const watchIntervalToleranceMs = {
    min: 850,
    max: 3_700,
  }

  await page.route('**/class/*/learning', async (route) => {
    const request = route.request()
    requestMethods.push(request.method())
    learningRequests.push({
      url: request.url(),
      authorization: request.headers().authorization,
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          units: [
            {
              learning_activities: [
                {
                  id: 671,
                  learning_activity_name: '影片一',
                  material: { duration: 363 },
                },
                {
                  id: 672,
                  learning_activity_name: '影片二',
                  material: { duration: 481 },
                },
                {
                  id: 672,
                  learning_activity_name: '影片二（重複）',
                  material: { duration: 999 },
                },
                {
                  id: 675,
                  material: { duration: 120.9 },
                },
                {
                  id: 673,
                  learning_activity_name: '考試',
                },
                {
                  id: 674,
                  learning_activity_name: '無效 duration',
                  material: { duration: '120' },
                },
              ],
            },
          ],
        },
      }),
    })
  })

  await page.route('**/class/*/learning-activity/*/start', async (route) => {
    const request = route.request()
    requestMethods.push(request.method())
    startRequests.push({
      url: request.url(),
      authorization: request.headers().authorization,
      activityId: request.url().match(/learning-activity\/([^/]+)\/start$/)?.[1] ?? null,
      requestedAt: Date.now(),
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: true }),
    })
  })

  await page.route('**/class/*/learning-activity/*/watch', async (route) => {
    const request = route.request()
    activeWatchRequests += 1
    maxConcurrentWatchRequests = Math.max(maxConcurrentWatchRequests, activeWatchRequests)
    requestMethods.push(request.method())
    watchRequests.push({
      url: request.url(),
      authorization: request.headers().authorization,
      activityId: request.url().match(/learning-activity\/([^/]+)\/watch$/)?.[1] ?? null,
      body: JSON.parse(request.postData() ?? '{}'),
      requestedAt: Date.now(),
    })

    try {
      await page.waitForTimeout(mockedWatchResponseDelayMs)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: true }),
      })
    } finally {
      activeWatchRequests -= 1
    }
  })

  const classIdInput = page.getByPlaceholder('例如 594')
  const authTokenInput = page.getByPlaceholder('貼上使用者自己的 Token')
  const submitButton = page.locator('button[type="submit"]')
  const toolCard = page.locator('.tool-card')
  const form = page.locator('form.form-block')
  const submittingOverlay = page.locator('.submitting-overlay')

  await classIdInput.fill('735')
  await authTokenInput.fill('test-token-value')
  const submitStartedAt = Date.now()
  await submitButton.click()

  await expect(submittingOverlay).toBeVisible()
  await expect(submittingOverlay).toContainText('送出中，請稍候…')
  await expect(submittingOverlay).toContainText('期間已暫時鎖定頁面操作')
  await expect(submittingOverlay.locator('.clock-spinner')).toBeVisible()
  await expect(toolCard).toHaveAttribute('aria-busy', 'true')
  await expect(toolCard).toHaveAttribute('inert', '')
  await expect(form).toHaveAttribute('aria-disabled', 'true')
  await expect(form.locator('fieldset').first()).toBeDisabled()
  await expect(form.locator('fieldset').nth(1)).toBeDisabled()
  await expect(submitButton).toBeDisabled()
  await expect(submitButton).toContainText('送出中…')
  await expect(submitButton.locator('.clock-spinner')).toBeVisible()

  await expect(page.getByText('已完成送出，共 3 筆 watch request 全部成功。')).toBeVisible({
    timeout: WATCH_SUBMISSION_TIMEOUT_MS,
  })
  await expect(submittingOverlay).toHaveCount(0)
  await expect(toolCard).toHaveAttribute('aria-busy', 'false')
  await expect(toolCard).not.toHaveAttribute('inert', '')
  await expect(form).toHaveAttribute('aria-disabled', 'false')
  await expect(submitButton).toContainText('取得 learning 並送出 watch requests')
  await expect(page.getByRole('heading', { name: '多筆發出資訊' })).toBeVisible()
  await expect(page.getByText('總筆數 3 筆｜成功 3 筆｜失敗 0 筆')).toBeVisible()
  await expect(page.getByText('所有 watch request 已完成且皆成功。')).toBeVisible()
  await expect(page.getByRole('heading', { name: '符合條件的 learning activity（3）' })).toBeVisible()
  expect(learningRequests).toHaveLength(1)
  expect(learningRequests[0]).toEqual({
    url: 'https://example.invalid/class/735/learning',
    authorization: 'Bearer test-token-value',
  })
  expect(requestMethods[0]).toBe('GET')
  expect(requestMethods.slice(1).every((method) => method === 'POST')).toBe(true)
  expect(requestMethods).toHaveLength(1 + expectedQualifiedActivityIds.length * 2)
  expect(startRequests).toHaveLength(expectedQualifiedActivityIds.length)
  expect(watchRequests).toHaveLength(expectedQualifiedActivityIds.length)
  expect(maxConcurrentWatchRequests).toBe(1)

  for (const [index, activityId] of expectedQualifiedActivityIds.entries()) {
    const startRequest = startRequests[index]
    const watchRequest = watchRequests[index]

    expect(startRequest.activityId).toBe(activityId)
    expect(watchRequest.activityId).toBe(activityId)
    expect(startRequest.authorization).toBe('Bearer test-token-value')
    expect(watchRequest.authorization).toBe('Bearer test-token-value')
    expect(startRequest.requestedAt).toBeLessThanOrEqual(watchRequest.requestedAt)
  }

  expect(watchRequests[0].requestedAt - submitStartedAt).toBeGreaterThanOrEqual(0)
  expect(watchRequests[0].requestedAt - submitStartedAt).toBeLessThanOrEqual(firstWatchRequestMaxDelayMs)
  for (let index = 1; index < watchRequests.length; index += 1) {
    const spacingMs = watchRequests[index].requestedAt - watchRequests[index - 1].requestedAt
    const intervalMs = spacingMs - mockedWatchResponseDelayMs
    expect(intervalMs).toBeGreaterThanOrEqual(watchIntervalToleranceMs.min)
    expect(intervalMs).toBeLessThanOrEqual(watchIntervalToleranceMs.max)
  }

  const expectedDurations = new Map([
    ['671', 363],
    ['672', 481],
    ['675', 120],
  ])

  for (const request of watchRequests) {
    const activityId = request.activityId
    expect(activityId).toBeTruthy()
    if (!activityId) {
      continue
    }

    expect(expectedDurations.has(activityId)).toBe(true)
    const expectedDuration = expectedDurations.get(activityId)
    expect(expectedDuration).toBeDefined()
    if (expectedDuration === undefined) {
      continue
    }

    const payload = request.body as {
      last_view_time?: unknown
      played?: unknown
      learning_time?: unknown
    }
    expect(payload.last_view_time).toBe(expectedDuration)
    expect(payload.learning_time).toBe(expectedDuration)
    expect(payload.played).toEqual([[0, expectedDuration]])
  }
})

test('shows multi-send summary and detail rows for mixed watch results', async ({ page }) => {
  test.setTimeout(45_000)
  await page.goto('/')

  await page.route('**/class/*/learning', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          units: [
            {
              learning_activities: [
                {
                  id: 701,
                  learning_activity_name: '影片一',
                  material: { duration: 100 },
                },
                {
                  id: 702,
                  learning_activity_name: '影片二',
                  material: { duration: 200 },
                },
                {
                  id: 703,
                  learning_activity_name: '影片三',
                  material: { duration: 300 },
                },
              ],
            },
          ],
        },
      }),
    })
  })

  await page.route('**/class/*/learning-activity/*/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: true }),
    })
  })

  await page.route('**/class/*/learning-activity/*/watch', async (route) => {
    const requestUrl = route.request().url()
    const activityId = requestUrl.match(/learning-activity\/([^/]+)\/watch$/)?.[1]

    if (activityId === '701') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: true }),
      })
      return
    }

    if (activityId === '702') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: false, message: 'server error' }),
      })
      return
    }

    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ status: false, message: 'too many requests' }),
    })
  })

  await page.getByPlaceholder('例如 594').fill('735')
  await page.getByPlaceholder('貼上使用者自己的 Token').fill('test-token-value')
  await page.getByRole('button', { name: '取得 learning 並送出 watch requests' }).click()

  await expect(page.getByRole('heading', { name: '多筆發出資訊' })).toBeVisible({
    timeout: WATCH_SUBMISSION_TIMEOUT_MS,
  })
  await expect(page.getByText('總筆數 3 筆｜成功 1 筆｜失敗 2 筆')).toBeVisible()
  await expect(page.getByText('部分 watch request 失敗，請查看下方回應明細。')).toBeVisible()
  await expect(page.locator('.message.error')).toHaveCount(0)

  await expect(page.locator('.watch-result-success')).toHaveCount(1)
  await expect(page.locator('.watch-result-error')).toHaveCount(2)
  await expect(page.locator('.watch-result', { hasText: '活動 #702 - 影片二' })).toContainText('HTTP 500')
  await expect(page.locator('.watch-result', { hasText: '活動 #702 - 影片二' })).toContainText('"message":"server error"')
  await expect(page.locator('.watch-result', { hasText: '活動 #703 - 影片三' })).toContainText('HTTP 429')
})

test('attributes start failure rows to start endpoint and skips watch for that activity', async ({ page }) => {
  test.setTimeout(45_000)
  await page.goto('/')

  const watchRequests: Array<{ url: string; activityId: string | null }> = []

  await page.route('**/class/*/learning', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          units: [
            {
              learning_activities: [
                {
                  id: 901,
                  learning_activity_name: '影片甲',
                  material: { duration: 120 },
                },
                {
                  id: 902,
                  learning_activity_name: '影片乙',
                  material: { duration: 240 },
                },
              ],
            },
          ],
        },
      }),
    })
  })

  await page.route('**/class/*/learning-activity/*/start', async (route) => {
    const requestUrl = route.request().url()
    const activityId = requestUrl.match(/learning-activity\/([^/]+)\/start$/)?.[1]

    if (activityId === '901') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ status: false, message: 'start failed' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: true }),
    })
  })

  await page.route('**/class/*/learning-activity/*/watch', async (route) => {
    const requestUrl = route.request().url()
    watchRequests.push({
      url: requestUrl,
      activityId: requestUrl.match(/learning-activity\/([^/]+)\/watch$/)?.[1] ?? null,
    })

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: true }),
    })
  })

  await page.getByPlaceholder('例如 594').fill('735')
  await page.getByPlaceholder('貼上使用者自己的 Token').fill('test-token-value')
  await page.getByRole('button', { name: '取得 learning 並送出 watch requests' }).click()

  await expect(page.getByRole('heading', { name: '多筆發出資訊' })).toBeVisible({
    timeout: WATCH_SUBMISSION_TIMEOUT_MS,
  })
  await expect(page.getByText('總筆數 2 筆｜成功 1 筆｜失敗 1 筆')).toBeVisible()
  await expect(page.getByText('部分 watch request 失敗，請查看下方回應明細。')).toBeVisible()

  const failedStartRow = page.locator('.watch-result', { hasText: '活動 #901 - 影片甲' })
  await expect(failedStartRow).toContainText('HTTP 500')
  await expect(failedStartRow).toContainText('"message":"start failed"')
  await expect(failedStartRow).toContainText('start request 失敗（HTTP 500），已略過 watch。')
  await expect(failedStartRow).not.toContainText('example.invalid')

  const successWatchRow = page.locator('.watch-result', { hasText: '活動 #902 - 影片乙' })
  await expect(successWatchRow).toContainText('HTTP 200')
  await expect(successWatchRow).not.toContainText('example.invalid')

  expect(watchRequests).toHaveLength(1)
  expect(watchRequests[0]).toEqual({
    url: 'https://example.invalid/class/735/learning-activity/902/watch',
    activityId: '902',
  })
})

test('shows all-failure summary as multi-send info and keeps watch detail rows', async ({ page }) => {
  test.setTimeout(45_000)
  await page.goto('/')

  await page.route('**/class/*/learning', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          units: [
            {
              learning_activities: [
                {
                  id: 801,
                  learning_activity_name: '影片甲',
                  material: { duration: 90 },
                },
                {
                  id: 802,
                  learning_activity_name: '影片乙',
                  material: { duration: 180 },
                },
              ],
            },
          ],
        },
      }),
    })
  })

  await page.route('**/class/*/learning-activity/*/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: true }),
    })
  })

  await page.route('**/class/*/learning-activity/*/watch', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ status: false, message: 'service unavailable' }),
    })
  })

  await page.getByPlaceholder('例如 594').fill('735')
  await page.getByPlaceholder('貼上使用者自己的 Token').fill('test-token-value')
  await page.getByRole('button', { name: '取得 learning 並送出 watch requests' }).click()

  await expect(page.getByRole('heading', { name: '多筆發出資訊' })).toBeVisible({
    timeout: WATCH_SUBMISSION_TIMEOUT_MS,
  })
  await expect(page.getByText('總筆數 2 筆｜成功 0 筆｜失敗 2 筆')).toBeVisible()
  await expect(page.getByText('全部 watch request 皆失敗，請查看下方回應明細。')).toBeVisible()
  await expect(page.locator('.message.error')).toHaveCount(0)
  await expect(page.locator('.watch-result-success')).toHaveCount(0)
  await expect(page.locator('.watch-result-error')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: 'Watch API 回應（共 2 筆）' })).toBeVisible()
})
