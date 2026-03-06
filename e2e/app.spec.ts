import { expect, test } from '@playwright/test'

test('shows the watch api tool heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Watch API 填寫工具' })).toBeVisible()
})

test('shows validation indicator with fade animation for failed submit', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: '送出 watch request' }).click()

  const validationIndicator = page.locator('.validation-error')
  await expect(validationIndicator).toBeVisible()
  await expect(validationIndicator).toContainText('請先修正以下問題：')
  await expect(validationIndicator).toHaveClass(/validation-error/)

  const animationName = await validationIndicator.evaluate(
    (node) => window.getComputedStyle(node).animationName,
  )
  expect(animationName).not.toBe('none')
  expect(animationName).toContain('fadeInOut')
})

test('shows input-error class and animation for empty required fields after failed submit', async ({ page }) => {
  await page.goto('/')

  // Clear all required fields
  await page.getByPlaceholder('例如 594').fill('') // classId
  await page.getByPlaceholder('例如 2241').fill('') // activityId
  await page.getByPlaceholder('貼上使用者自己的 Token').fill('') // authToken

  await page.getByRole('button', { name: '送出 watch request' }).click()

  // Check input-error class for each required input
  const classIdInput = page.getByPlaceholder('例如 594')
  const activityIdInput = page.getByPlaceholder('例如 2241')
  const authTokenInput = page.getByPlaceholder('貼上使用者自己的 Token')

  await expect(classIdInput).toHaveClass(/input-error/)
  await expect(activityIdInput).toHaveClass(/input-error/)
  await expect(authTokenInput).toHaveClass(/input-error/)

  // Check animation is active for each
  const classIdAnim = await classIdInput.evaluate(node => window.getComputedStyle(node).animationName)
  const activityIdAnim = await activityIdInput.evaluate(node => window.getComputedStyle(node).animationName)
  const authTokenAnim = await authTokenInput.evaluate(node => window.getComputedStyle(node).animationName)

  expect(classIdAnim).toContain('fadeInOut')
  expect(activityIdAnim).toContain('fadeInOut')
  expect(authTokenAnim).toContain('fadeInOut')

  // Fill one required field and check input-error removed
  await classIdInput.fill('594')
  await page.getByRole('button', { name: '送出 watch request' }).click()
  await expect(classIdInput).not.toHaveClass(/input-error/)
})
