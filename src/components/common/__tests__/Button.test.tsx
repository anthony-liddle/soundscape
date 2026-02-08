import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../Button'

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  describe('variants', () => {
    it('applies primary variant by default', () => {
      render(<Button>Primary</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn-primary')
    })

    it('applies secondary variant', () => {
      render(<Button variant="secondary">Secondary</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn-secondary')
    })

    it('applies danger variant', () => {
      render(<Button variant="danger">Danger</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn-danger')
    })
  })

  describe('sizes', () => {
    it('applies medium size by default', () => {
      render(<Button>Medium</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn-medium')
    })

    it('applies small size', () => {
      render(<Button size="small">Small</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn-small')
    })

    it('applies large size', () => {
      render(<Button size="large">Large</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn-large')
    })
  })

  describe('active state', () => {
    it('does not apply active class by default', () => {
      render(<Button>Button</Button>)
      const button = screen.getByRole('button')
      expect(button).not.toHaveClass('btn-active')
    })

    it('applies active class when active', () => {
      render(<Button active>Active</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn-active')
    })
  })

  describe('custom className', () => {
    it('merges custom className', () => {
      render(<Button className="custom-class">Button</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('btn', 'custom-class')
    })
  })

  describe('disabled state', () => {
    it('can be disabled', () => {
      render(<Button disabled>Disabled</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      render(
        <Button disabled onClick={handleClick}>
          Disabled
        </Button>
      )

      await user.click(screen.getByRole('button'))
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('type attribute', () => {
    it('supports submit type', () => {
      render(<Button type="submit">Submit</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('type', 'submit')
    })
  })
})
