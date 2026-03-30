import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from '../Select'

const options = [
  { value: 'lowpass', label: 'Low Pass' },
  { value: 'highpass', label: 'High Pass' },
]

describe('Select', () => {
  describe('tooltip hint', () => {
    it('shows a ? badge when tooltip prop is provided', () => {
      render(<Select value="lowpass" options={options} label="Type" tooltip="Filter shape" onChange={vi.fn()} />)
      expect(screen.getByText('?')).toBeInTheDocument()
    })

    it('does not show a ? badge when tooltip prop is absent', () => {
      render(<Select value="lowpass" options={options} label="Type" onChange={vi.fn()} />)
      expect(screen.queryByText('?')).not.toBeInTheDocument()
    })

    it('shows the tooltip text on hover', async () => {
      const user = userEvent.setup()
      render(<Select value="lowpass" options={options} label="Type" tooltip="Filter shape" onChange={vi.fn()} />)

      await user.hover(screen.getByText('Type'))
      expect(screen.getByText('Filter shape')).toBeInTheDocument()
    })
  })
})
