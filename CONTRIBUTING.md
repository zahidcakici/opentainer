# Contributing to Opentainer

First off, thank you for considering contributing to Opentainer! It's people like you that make Opentainer such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** (copy/paste commands, screenshots)
- **Describe the behavior you observed and what you expected**
- **Include your environment details** (OS, Docker version, app version)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the proposed enhancement**
- **Explain why this enhancement would be useful**
- **Include mockups or examples if applicable**

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes** following our coding standards
4. **Add tests** if applicable
5. **Run the test suite**: `npm run test`
6. **Run linting**: `npm run lint`
7. **Run type checking**: `npm run type-check`
8. **Commit your changes** with a descriptive commit message
9. **Push to your fork** and submit a pull request

## Development Setup

### Prerequisites

- Node.js 18+
- Rust 1.75+
- Docker (running)

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/opentainer.git
cd opentainer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Project Structure

```
├── src/                 # React frontend (TypeScript)
│   ├── components/      # UI components
│   ├── hooks/           # Custom React hooks
│   └── lib/             # Utilities and API
├── src-tauri/           # Rust backend
│   └── src/             # Tauri commands and Docker integration
```

## Coding Standards

### TypeScript/React

- Use functional components with hooks
- Use TypeScript for all new code
- Follow the existing code style (ESLint will help)
- Use meaningful variable and function names
- Add JSDoc comments for exported functions

### Rust

- Follow Rust idioms and best practices
- Use `cargo clippy` to catch common mistakes
- Use `cargo fmt` for consistent formatting
- Add doc comments for public functions

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add container restart functionality
fix: resolve memory leak in log streaming
docs: update installation instructions
style: format code with prettier
refactor: simplify container state management
test: add tests for volume management
chore: update dependencies
```

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring

## Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Run with coverage
npm run test -- --coverage
```

## Need Help?

Feel free to open an issue with your question or reach out to the maintainers.

Thank you for contributing! 🎉
