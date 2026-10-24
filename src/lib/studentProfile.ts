/**
 * Student academic details collected at signup and reused on event forms.
 * Keep these lists in sync with the CHECK constraints in
 * supabase/migrations/006_student_and_club_profiles.sql.
 */
export const SEMESTERS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'] as const
export type Semester = (typeof SEMESTERS)[number]

export const DEPARTMENTS = [
  'CSE R1',
  'CSE R2',
  'CSE R3',
  'CIVIL',
  'MECH',
  'ES',
  'EC',
  'EL',
  'EEE',
  'AH',
  'MCA',
] as const
export type Department = (typeof DEPARTMENTS)[number]

export const MIN_AGE = 10
export const MAX_AGE = 100

export function isValidAge(value: string | number): boolean {
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isInteger(n) && n >= MIN_AGE && n <= MAX_AGE
}

export function isSemester(value: string): value is Semester {
  return (SEMESTERS as readonly string[]).includes(value)
}

export function isDepartment(value: string): value is Department {
  return (DEPARTMENTS as readonly string[]).includes(value)
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

/** Returns a user-facing error, or null when the student details are valid. */
export function validateStudentDetails(input: {
  age: string | number
  semester: string
  department: string
}): string | null {
  if (!isValidAge(input.age)) return `Enter an age between ${MIN_AGE} and ${MAX_AGE}`
  if (!isSemester(input.semester)) return 'Select your semester'
  if (!isDepartment(input.department)) return 'Select your department'
  return null
}
