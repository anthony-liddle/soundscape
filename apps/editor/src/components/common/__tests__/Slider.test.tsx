import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Slider } from '../Slider'

describe('Slider', () => {
  describe('tooltip hint', () => {
    it('shows a ? badge when tooltip prop is provided', () => {
      render(<Slider value={0.5} label="Attack" tooltip="How quickly the sound rises" onChange={vi.fn()} />)
      expect(screen.getByText('ⓘ')).toBeInTheDocument()
    })

    it('does not show a ? badge when tooltip prop is absent', () => {
      render(<Slider value={0.5} label="Attack" onChange={vi.fn()} />)
      expect(screen.queryByText('ⓘ')).not.toBeInTheDocument()
    })

    it('shows the tooltip text on hover', async () => {
      const user = userEvent.setup()
      render(<Slider value={0.5} label="Attack" tooltip="How quickly the sound rises" onChange={vi.fn()} />)

      await user.hover(screen.getByText('Attack'))
      expect(screen.getByText('How quickly the sound rises')).toBeInTheDocument()
    })
  })
})
