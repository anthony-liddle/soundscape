# Contributing to Soundscape

Thank you for your interest in contributing to Soundscape! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

Before submitting a bug report:
1. Check the [existing issues](../../issues) to avoid duplicates
2. Ensure the bug is reproducible in the latest version

When submitting a bug report, include:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Browser and OS information
- Screenshots or recordings if applicable

### Suggesting Features

Feature suggestions are welcome! Please:
1. Check existing issues and discussions first
2. Provide a clear use case for the feature
3. Explain how it benefits users

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following our coding standards
4. **Test your changes**: `npm run build` should complete without errors
5. **Commit your changes** with clear, descriptive messages
6. **Push to your fork** and submit a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/soundscape.git
cd soundscape

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Coding Standards

### TypeScript
- Use TypeScript for all new code
- Define interfaces for props and state
- Avoid `any` types; use proper typing

### React
- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks

### CSS
- Use CSS files alongside components
- Follow existing naming conventions (BEM-style)
- Avoid inline styles except for dynamic values

### File Organization
- Place components in `src/components/ComponentName/`
- Include `ComponentName.tsx`, `ComponentName.css`, and `index.ts`
- Keep related utilities in `src/utils/`

## Commit Messages

Use clear, descriptive commit messages:
- `feat: add velocity editing to note editor`
- `fix: resolve audio crackling on rapid note playback`
- `docs: update integration instructions`
- `refactor: simplify mixer state management`

## Testing

Currently, the project uses TypeScript compilation as the primary validation:
```bash
npm run build
```

Ensure the build completes without errors before submitting a PR.

## Areas for Contribution

### Good First Issues
- UI/UX improvements
- Documentation updates
- Accessibility enhancements
- Additional instrument presets

### Larger Contributions
- New effects (reverb, chorus, etc.)
- MIDI import/export
- Keyboard shortcuts
- Undo/redo functionality
- Mobile touch support

## Questions?

Feel free to open an issue for questions or discussions about potential contributions.
