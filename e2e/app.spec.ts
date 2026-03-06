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
