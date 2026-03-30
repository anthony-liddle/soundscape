import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from '../Tooltip'

describe('Tooltip', () => {
  it('renders children without the tooltip panel initially', () => {
    render(<Tooltip text="Helpful hint"><span>Label</span></Tooltip>)
    expect(screen.getByText('Label')).toBeInTheDocument()
    expect(screen.queryByText('Helpful hint')).not.toBeInTheDocument()
  })

  it('shows the tooltip panel on hover', async () => {
    const user = userEvent.setup()
    render(<Tooltip text="Helpful hint"><span>Label</span></Tooltip>)

    await user.hover(screen.getByText('Label'))
    expect(screen.getByText('Helpful hint')).toBeInTheDocument()
  })

  it('hides the tooltip panel when the pointer leaves', async () => {
    const user = userEvent.setup()
    render(<Tooltip text="Helpful hint"><span>Label</span></Tooltip>)

    await user.hover(screen.getByText('Label'))
    expect(screen.getByText('Helpful hint')).toBeInTheDocument()

    await user.unhover(screen.getByText('Label'))
    expect(screen.queryByText('Helpful hint')).not.toBeInTheDocument()
  })

  it('renders the tooltip panel into document.body via portal', async () => {
    const user = userEvent.setup()
    const { baseElement } = render(<Tooltip text="Portal text"><span>Trigger</span></Tooltip>)

    await user.hover(screen.getByText('Trigger'))
    const panel = screen.getByText('Portal text')
    // Panel should be a direct child of body, not inside the component's own DOM subtree
    expect(document.body.contains(panel)).toBe(true)
    expect(baseElement.querySelector('.tooltip-panel')).toBeTruthy()
  })
})
