# Code Review Guidelines

## Project Architecture

This project follows a modular architecture with the following principles:

- **Separation of Concerns**: Each module should have a single, well-defined responsibility
- **Dependency Injection**: Avoid tight coupling between modules
- **Error Handling**: All async operations must have proper error handling with meaningful messages

## Coding Standards

### TypeScript
- Use strict TypeScript settings
- Avoid `any` types - use proper type definitions
- Prefer interfaces over type aliases for object shapes
- Use const assertions where appropriate

### Code Style
- Use descriptive variable and function names
- Functions should be small and focused (ideally under 50 lines)
- Add JSDoc comments for public APIs
- Use async/await over raw promises

### Security
- Validate all user inputs
- Never log sensitive information (API keys, tokens, passwords)
- Use environment variables for secrets
- Sanitize data before displaying to users

### Testing
- All new features should include unit tests
- Test edge cases and error conditions
- Mock external dependencies

## Specific Areas of Focus

When reviewing code, pay special attention to:

1. **Performance**: Are there any obvious performance bottlenecks?
2. **Security**: Could this code introduce security vulnerabilities?
3. **Maintainability**: Is the code easy to understand and modify?
4. **Error Handling**: Are errors properly caught and handled?
5. **Type Safety**: Is TypeScript being used effectively?

## Common Issues to Look For

- Memory leaks (unclosed connections, event listeners)
- Race conditions in async code
- Missing null/undefined checks
- Inconsistent error handling
- Hardcoded values that should be configurable
- Missing or inadequate tests
