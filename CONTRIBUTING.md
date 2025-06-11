# Contributing to Leaf Server

First off, thank you for considering contributing to Leaf Server! It's people like you that make Leaf such a great tool.

## Table of Contents
1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Environment](#development-environment)
4. [Making Changes](#making-changes)
5. [Submitting Changes](#submitting-changes)
6. [Coding Standards](#coding-standards)
7. [Testing](#testing)
8. [Project Structure](#project-structure)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- Git
- Node Version Manager (NVM)
  - Ubuntu: NVM version 0.39.0+
  - Windows: NVM version 1.2.1+
- Node.js 22.0+ (via NVM)
- NPM 10.5.1+

### Initial Setup

1. Fork the repository on GitLab
2. Clone your fork locally:
   ```bash
   git clone git@gitlab.com:YOUR_USERNAME/leaf_server.git
   cd leaf_server
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm start
   ```

## Development Environment

### Ubuntu Setup
- Install NVM version 0.39.0 or later
- Install Node.js 22.0 using NVM
- Install NPM 10.5.1 or later

### Windows Setup
1. Install required software:
   - Git
   - NVM for Windows
2. Open PowerShell as administrator and run:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
   ```
3. Install Node.js via NVM:
   ```bash
   nvm install 22
   nvm use 22
   ```

## Making Changes

1. Create a new branch for your feature:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Write or update tests as needed
4. Run the test suite:
   ```bash
   npm test
   ```
5. Ensure your code follows our style guidelines

## Submitting Changes

1. Push your changes to your fork
2. Submit a merge request to the main repository
3. Include a clear description of your changes
4. Reference any related issues

### Commit Message Guidelines

Follow the conventional commits format:
- feat: new feature
- fix: bug fix
- docs: documentation changes
- style: formatting, missing semicolons, etc.
- refactor: code restructuring
- test: adding tests
- chore: maintenance

## Coding Standards

### JavaScript/TypeScript
- Use TypeScript for all new code
- Include type definitions
- Follow ESLint configuration
- Use async/await for asynchronous operations
- Handle errors appropriately
- Document complex functions

### WebSocket Events
- Follow established event naming conventions
- Document all event payloads
- Include proper error handling
- Maintain backward compatibility
- Add appropriate logging

### Security
- Validate all incoming data
- Implement proper error handling
- Follow security best practices
- Document security considerations

## Testing

- Write tests for all new features
- Maintain existing tests
- Run tests before submitting changes:
  ```bash
  npm test
  ```

### Test Guidelines
- Unit test all new functions
- Integration test WebSocket events
- Test error conditions
- Mock external dependencies
- Maintain test coverage

## Project Structure

```
leaf_server/
├── src/               # Source code
│   ├── events/       # WebSocket event handlers
│   ├── utils/        # Utility functions
│   └── server.js     # Main server file
├── tests/            # Test files
├── package.json      # Dependencies and scripts
└── tsconfig.json    # TypeScript configuration
```

### Key Technologies
- Node.js
- Socket.IO
- TypeScript
- Jest for testing

## Questions or Problems?

- File an issue in the GitLab repository
- Contact the maintainers
- Join our community discussions

Thank you for contributing to Leaf Server! 