/**
 * Student roll (entry) numbers are either letters only, such as "ABCD", or
 * letters mixed with digits, such as "2023CSB1092". At least one letter is
 * required; digits-only values are rejected.
 */
export const ROLL_MIN_LENGTH = 4;
export const ROLL_MAX_LENGTH = 32;

const ROLL_PATTERN = new RegExp(
  `^(?=.*[A-Za-z])[A-Za-z0-9]{${ROLL_MIN_LENGTH},${ROLL_MAX_LENGTH}}$`
);

export function isValidRoll(entry: string): boolean {
  return ROLL_PATTERN.test(entry);
}

export const ROLL_HINT = `Use ${ROLL_MIN_LENGTH} to ${ROLL_MAX_LENGTH} letters, or letters and numbers, like 2023CSB1092.`;
