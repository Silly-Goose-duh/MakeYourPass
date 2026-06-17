import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, GripVertical, ChevronDown, Type, AlignLeft, List, CheckSquare, ListOrdered, Ruler } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { FormQuestion } from '@/types'

const QUESTION_TYPES = [
  { value: 'short_text', label: 'Short Text', icon: Type },
  { value: 'paragraph', label: 'Paragraph', icon: AlignLeft },
  { value: 'multiple_choice', label: 'Multiple Choice', icon: List },
  { value: 'checkboxes', label: 'Checkboxes', icon: CheckSquare },
  { value: 'dropdown', label: 'Dropdown', icon: ListOrdered },
  { value: 'linear_scale', label: 'Linear Scale', icon: Ruler },
] as const

interface FormBuilderProps {
  questions: FormQuestion[]
  onChange: (questions: FormQuestion[]) => void
}

export function FormBuilder({ questions, onChange }: FormBuilderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addQuestion = (type: FormQuestion['question_type']) => {
    const newQ: FormQuestion = {
      title: '',
      description: '',
      question_type: type,
      options: type === 'multiple_choice' || type === 'checkboxes' || type === 'dropdown' ? ['Option 1'] : [],
      required: false,
      sort_order: questions.length,
    }
    onChange([...questions, newQ])
  }

  const updateQuestion = (index: number, updates: Partial<FormQuestion>) => {
    const updated = questions.map((q, i) => (i === index ? { ...q, ...updates } : q))
    onChange(updated)
  }

  const removeQuestion = (index: number) => {
    onChange(questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, sort_order: i })))
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= questions.length) return
    const updated = [...questions]
    ;[updated[index], updated[newIndex]] = [updated[newIndex], updated[index]]
    onChange(updated.map((q, i) => ({ ...q, sort_order: i })))
  }

  const addOption = (qIndex: number) => {
    const q = questions[qIndex]
    updateQuestion(qIndex, { options: [...q.options, `Option ${q.options.length + 1}`] })
  }

  const updateOption = (qIndex: number, oIndex: number, value: string) => {
    const q = questions[qIndex]
    const opts = [...q.options]
    opts[oIndex] = value
    updateQuestion(qIndex, { options: opts })
  }

  const removeOption = (qIndex: number, oIndex: number) => {
    const q = questions[qIndex]
    if (q.options.length <= 1) return
    updateQuestion(qIndex, { options: q.options.filter((_, i) => i !== oIndex) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Form Questions</h3>
        <div className="relative" ref={dropdownRef}>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <Plus className="h-4 w-4" />
            Add Question
          </Button>
          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-xl shadow-xl z-50"
              >
                <div className="p-1.5 space-y-0.5">
                  {QUESTION_TYPES.map(qt => (
                    <button
                      key={qt.value}
                      type="button"
                      onClick={() => {
                        addQuestion(qt.value as FormQuestion['question_type'])
                        setDropdownOpen(false)
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
                    >
                      <qt.icon className="h-4 w-4" />
                      {qt.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {questions.length === 0 && (
        <div className="text-center py-12 text-text-muted border-2 border-dashed border-border rounded-xl">
          <p className="text-sm">No questions yet. Click "Add Question" to start building your form.</p>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {questions.map((question, index) => {
          const TypeIcon = QUESTION_TYPES.find(qt => qt.value === question.question_type)?.icon || Type
          return (
            <motion.div
              key={`q-${index}`}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="bg-surface border border-border rounded-xl p-4 space-y-3"
            >
              {/* Header */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="cursor-grab text-text-muted hover:text-text-secondary transition-colors"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  <TypeIcon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-primary uppercase tracking-wider">
                    {QUESTION_TYPES.find(qt => qt.value === question.question_type)?.label || question.question_type}
                  </span>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, 'up')}
                    disabled={index === 0}
                    className="p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-elevated disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, 'down')}
                    disabled={index === questions.length - 1}
                    className="p-1 rounded-md text-text-muted hover:text-text-secondary hover:bg-surface-elevated disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(index)}
                    className="p-1 rounded-md text-text-muted hover:text-error hover:bg-error/5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Question title */}
              <input
                type="text"
                value={question.title}
                onChange={e => updateQuestion(index, { title: e.target.value })}
                placeholder="Question title"
                className="w-full bg-transparent border-b border-border focus:border-primary text-text-primary font-medium text-sm px-0 py-1 outline-none transition-colors placeholder:text-text-muted"
              />

              {/* Description (optional) */}
              <input
                type="text"
                value={question.description}
                onChange={e => updateQuestion(index, { description: e.target.value })}
                placeholder="Description (optional)"
                className="w-full bg-transparent text-text-secondary text-xs px-0 py-0.5 outline-none placeholder:text-text-muted"
              />

              {/* Options for MC / Checkboxes / Dropdown */}
              {(question.question_type === 'multiple_choice' || question.question_type === 'checkboxes' || question.question_type === 'dropdown') && (
                <div className="space-y-1.5 pl-2">
                  {question.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      {question.question_type === 'multiple_choice' && <div className="h-4 w-4 rounded-full border-2 border-border shrink-0" />}
                      {question.question_type === 'checkboxes' && <div className="h-4 w-4 rounded border-2 border-border shrink-0" />}
                      {question.question_type === 'dropdown' && <span className="text-text-muted text-xs">{oi + 1}.</span>}
                      <input
                        type="text"
                        value={opt}
                        onChange={e => updateOption(index, oi, e.target.value)}
                        className="flex-1 bg-transparent border-b border-border/50 focus:border-primary/50 text-text-primary text-sm px-0 py-0.5 outline-none transition-colors placeholder:text-text-muted"
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(index, oi)}
                        className="p-0.5 text-text-muted hover:text-error transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addOption(index)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover transition-colors mt-1"
                  >
                    <Plus className="h-3 w-3" /> Add option
                  </button>
                </div>
              )}

              {/* Linear scale preview */}
              {question.question_type === 'linear_scale' && (
                <div className="flex items-center gap-3 pl-2">
                  <span className="text-xs text-text-muted">1</span>
                  <div className="flex-1 h-1.5 bg-border rounded-full">
                    <div className="h-full w-0 rounded-full bg-primary transition-all" />
                  </div>
                  <span className="text-xs text-text-muted">5</span>
                </div>
              )}

              {/* Required toggle */}
              <div className="flex items-center gap-2 pt-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={e => updateQuestion(index, { required: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-border rounded-full peer peer-checked:bg-primary/60 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
                </label>
                <span className="text-xs text-text-muted">Required</span>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
