import { describe, it, expect } from 'vitest'
import {
  DEPARTMENTS,
  MAX_AGE,
  MIN_AGE,
  SEMESTERS,
  isDepartment,
  isSemester,
  isValidAge,
  isValidEmail,
  isValidPhone,
  validateStudentDetails,
} from '../src/lib/studentProfile'

describe('student profile options', () => {
  it('exposes exactly S1–S8', () => {
    expect(SEMESTERS).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'])
  })

  it('exposes the college department list', () => {
    expect(DEPARTMENTS).toEqual([
      'CSE R1', 'CSE R2', 'CSE R3', 'CIVIL', 'MECH', 'ES', 'EC', 'EL', 'EEE', 'AH', 'MCA',
    ])
  })
})

describe('isValidAge', () => {
  it('accepts integer ages inside the allowed range', () => {
    expect(isValidAge(MIN_AGE)).toBe(true)
    expect(isValidAge(MAX_AGE)).toBe(true)
    expect(isValidAge('19')).toBe(true)
  })

  it('rejects empty, fractional, and out-of-range values', () => {
    expect(isValidAge('')).toBe(false)
    expect(isValidAge('12.5')).toBe(false)
    expect(isValidAge(MIN_AGE - 1)).toBe(false)
    expect(isValidAge(MAX_AGE + 1)).toBe(false)
    expect(isValidAge('abc')).toBe(false)
  })
})

describe('semester and department guards', () => {
  it('only accepts the published options', () => {
    expect(isSemester('S1')).toBe(true)
    expect(isSemester('S9')).toBe(false)
    expect(isDepartment('CSE R1')).toBe(true)
    expect(isDepartment('IT')).toBe(false)
  })
})

describe('contact validation', () => {
  it('accepts Indian-style phone numbers and rejects short ones', () => {
    expect(isValidPhone('+91 98765 43210')).toBe(true)
    expect(isValidPhone('9876543210')).toBe(true)
    expect(isValidPhone('12345')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })

  it('validates email shape', () => {
    expect(isValidEmail('student@college.edu')).toBe(true)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

describe('validateStudentDetails', () => {
  it('passes a complete profile', () => {
    expect(validateStudentDetails({ age: '20', semester: 'S3', department: 'CSE R1' })).toBeNull()
  })

  it('reports the first missing field', () => {
    expect(validateStudentDetails({ age: '', semester: 'S3', department: 'CSE R1' })).toMatch(/age/i)
    expect(validateStudentDetails({ age: '20', semester: '', department: 'CSE R1' })).toMatch(/semester/i)
    expect(validateStudentDetails({ age: '20', semester: 'S3', department: '' })).toMatch(/department/i)
  })
})
