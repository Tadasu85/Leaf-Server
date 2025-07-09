# Leaf Server CI/CD Setup

This document describes the CI/CD pipeline setup for the Leaf Server project using GitLab CI/CD.

## Overview

The CI/CD pipeline is configured to automatically build, test, and deploy the Leaf Server application. The pipeline includes:

- **Linting**: TypeScript compilation checks
- **Testing**: Unit tests with coverage reporting
- **Security Audit**: npm audit for vulnerability scanning
- **Building**: TypeScript compilation to JavaScript
- **Deployment**: Staging and production deployments

## Pipeline Stages

### 1. Lint Stage
- Runs TypeScript compilation check (`tsc --noEmit`)
- Ensures code compiles without errors
- Runs on merge requests, main branch, and tags

### 2. Test Stage
- Runs Jest unit tests with coverage
- Generates coverage reports (text, lcov, cobertura, json)
- Performs security audit with npm audit
- Runs on merge requests, main branch, and tags

### 3. Build Stage
- Compiles TypeScript to JavaScript
- Creates build artifacts for deployment
- Runs on merge requests, main branch, and tags

### 4. Deploy Stage
- **Staging**: Manual deployment for main branch
- **Production**: Manual deployment for tags only
- **Performance Testing**: Optional manual performance tests

## Configuration Files

### `.gitlab-ci.yml`
Main CI/CD configuration file with pipeline stages and jobs.

### `Dockerfile`
Multi-stage Dockerfile for building and running the application:
- **Builder stage**: Installs dependencies and builds TypeScript
- **Production stage**: Creates optimized production image

### `docker-compose.yml`
Local development and testing setup with multiple services:
- `leaf-server`: Production service
- `leaf-server-dev`: Development service with hot reload
- `leaf-server-test`: Test service

### `scripts/deploy.sh`
Deployment script that can be customized for different environments.

## Usage

### Local Development

1. **Start development server:**
   ```bash
   docker-compose --profile dev up
   ```

2. **Run tests:**
   ```bash
   docker-compose --profile test up
   ```

3. **Start production server:**
   ```bash
   docker-compose up
   ```

### GitLab CI/CD

The pipeline runs automatically on:
- **Merge Requests**: Lint, test, and build stages
- **Main Branch**: All stages including manual staging deployment
- **Tags**: All stages including manual production deployment

### Manual Deployment

1. **Staging Deployment:**
   - Push to main branch
   - Go to GitLab CI/CD > Pipelines
   - Click "Play" on the `deploy-staging` job

2. **Production Deployment:**
   - Create and push a tag: `git tag v1.0.0 && git push origin v1.0.0`
   - Go to GitLab CI/CD > Pipelines
   - Click "Play" on the `deploy-production` job

## Environment Variables

Configure these in GitLab Settings > CI/CD > Variables:

### Required Variables
- `DEPLOY_ENV`: Deployment environment (staging/production)
- `DOCKER_IMAGE`: Docker image name
- `DOCKER_TAG`: Docker image tag

### Optional Variables
- `NODE_ENV`: Node.js environment (test/development/production)
- `PORT`: Application port (default: 3000)

## Coverage Reports

The pipeline generates coverage reports in multiple formats:
- **Text**: Console output
- **LCOV**: For code coverage tools
- **Cobertura**: For GitLab coverage visualization
- **JSON**: For programmatic access

Coverage reports are available in the GitLab CI/CD interface under:
- Pipeline > Jobs > Test > Coverage

## Security

### Security Audit
- Runs `npm audit` with moderate level warnings
- Does not fail the pipeline (allow_failure: true)
- Review security warnings in the pipeline logs

### Docker Security
- Uses non-root user (nodejs:1001)
- Multi-stage build reduces attack surface
- Health checks ensure application availability

## Troubleshooting

### Common Issues

1. **Build Failures:**
   - Check TypeScript compilation errors
   - Verify all dependencies are installed
   - Review package.json scripts

2. **Test Failures:**
   - Check test coverage thresholds
   - Review test timeout settings
   - Verify test environment variables

3. **Deployment Failures:**
   - Check environment variables
   - Verify deployment permissions
   - Review deployment script logs

### Debugging

1. **Local Testing:**
   ```bash
   # Run tests locally
   npm test
   
   # Build locally
   npm run build
   
   # Run with Docker
   docker build -t leaf-server .
   docker run -p 3000:3000 leaf-server
   ```

2. **Pipeline Debugging:**
   - Check pipeline logs in GitLab
   - Review artifact contents
   - Verify cache configuration

## Customization

### Adding New Stages

1. Add stage to `stages` array in `.gitlab-ci.yml`
2. Create job configuration
3. Define rules for when to run

### Customizing Deployment

1. Edit `scripts/deploy.sh` for your deployment environment
2. Update environment variables in GitLab
3. Configure deployment targets

### Adding New Tests

1. Add test files to `tests/` directory
2. Update Jest configuration if needed
3. Verify coverage thresholds

## Best Practices

1. **Branch Protection:**
   - Require pipeline success before merge
   - Enable code review requirements
   - Set up merge request templates

2. **Security:**
   - Regularly update dependencies
   - Review security audit results
   - Use secrets management for sensitive data

3. **Monitoring:**
   - Set up application monitoring
   - Configure error tracking
   - Monitor deployment success rates

## Support

For issues with the CI/CD pipeline:
1. Check the troubleshooting section
2. Review GitLab CI/CD documentation
3. Contact the development team 