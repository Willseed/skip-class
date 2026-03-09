// Utility functions
export const wait = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const getRandomIntInclusive = (min: number, max: number): number => {
  const normalizedMin = Math.ceil(min);
  const normalizedMax = Math.floor(max);
  return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
};
