import { expect, test } from '@playwright/test'

test('shows the watch api tool heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Watch API 填寫工具' })).toBeVisible()
})

test('shows inline field errors and no global validation summary for failed submit', async ({ page }) => {
  await page.goto('/')

  const classIdInput = page.getByPlaceholder('例如 594')
  const activityIdInput = page.getByPlaceholder('例如 2241')
  const authTokenInput = page.getByPlaceholder('貼上使用者自己的 Token')

  await classIdInput.fill('')
  await activityIdInput.fill('')
  await authTokenInput.fill('')

  await page.getByRole('button', { name: '送出 watch request' }).click()

  await expect(page.locator('.validation-error')).toHaveCount(0)
  await expect(page.getByText('請先修正以下問題：')).toHaveCount(0)

  await expect(classIdInput).toHaveClass(/input-error/)
  await expect(activityIdInput).toHaveClass(/input-error/)
  await expect(authTokenInput).toHaveClass(/input-error/)

  const classIdField = page.locator('label', { has: classIdInput })
  const activityIdField = page.locator('label', { has: activityIdInput })
  const authTokenField = page.locator('label', { has: authTokenInput })

  await expect(classIdField.getByText('請輸入課程ID(class)。')).toBeVisible()
  await expect(activityIdField.getByText('請輸入活動ID(learning-activity)。')).toBeVisible()
  await expect(authTokenField.getByText('請輸入授權 Token。')).toBeVisible()
})

test('runs input-error animation once instead of infinitely for invalid fields', async ({ page }) => {
  await page.goto('/')

  const requiredInputs = [
    page.getByPlaceholder('例如 594'),
    page.getByPlaceholder('例如 2241'),
    page.getByPlaceholder('貼上使用者自己的 Token'),
  ]

  for (const input of requiredInputs) {
    await input.fill('')
  }

  await page.getByRole('button', { name: '送出 watch request' }).click()

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
