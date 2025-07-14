#!/bin/bash

# Setup script for GitLab CI/CD
# This script helps you set up the GitLab repository with the CI/CD configuration

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITLAB_REPO="https://gitlab.com/Tadasu85/leaf_server.git"
CURRENT_DIR=$(pwd)

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if git is installed
check_git() {
    if ! command -v git &> /dev/null; then
        log_warn "Git is not installed. Please install git first."
        exit 1
    fi
}

# Check if we're in the right directory
check_directory() {
    if [ ! -f "package.json" ] || [ ! -f ".gitlab-ci.yml" ]; then
        log_warn "Please run this script from the leaf_server directory"
        exit 1
    fi
}

# Initialize git repository
init_git() {
    log_step "Initializing git repository..."
    
    if [ ! -d ".git" ]; then
        git init
        log_info "Git repository initialized"
    else
        log_info "Git repository already exists"
    fi
}

# Add remote origin
add_remote() {
    log_step "Adding GitLab remote..."
    
    if git remote get-url origin &> /dev/null; then
        log_info "Remote origin already exists"
        CURRENT_REMOTE=$(git remote get-url origin)
        log_info "Current remote: $CURRENT_REMOTE"
        
        if [ "$CURRENT_REMOTE" != "$GITLAB_REPO" ]; then
            log_warn "Remote URL doesn't match expected GitLab URL"
            read -p "Do you want to update the remote URL? (y/n): " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                git remote set-url origin "$GITLAB_REPO"
                log_info "Remote URL updated"
            fi
        fi
    else
        git remote add origin "$GITLAB_REPO"
        log_info "Remote origin added"
    fi
}

# Add all files
add_files() {
    log_step "Adding files to git..."
    
    git add .
    log_info "Files added to staging area"
}

# Create initial commit
create_commit() {
    log_step "Creating initial commit..."
    
    if git diff --cached --quiet; then
        log_info "No changes to commit"
    else
        git commit -m "Initial commit: Add CI/CD configuration

- Add GitLab CI/CD pipeline configuration

- Add deployment scripts
- Add comprehensive documentation
- Update Jest configuration for coverage reports"
        log_info "Initial commit created"
    fi
}

# Push to GitLab
push_to_gitlab() {
    log_step "Pushing to GitLab..."
    
    # Check if we have a main branch
    if git branch --show-current | grep -q "main\|master"; then
        BRANCH=$(git branch --show-current)
    else
        BRANCH="main"
        git checkout -b main
        log_info "Created and switched to main branch"
    fi
    
    # Push to GitLab
    git push -u origin "$BRANCH"
    log_info "Pushed to GitLab successfully"
}

# Show next steps
show_next_steps() {
    log_step "Next Steps:"
    echo
    echo "1. Go to your GitLab repository: $GITLAB_REPO"
    echo "2. Check the CI/CD pipeline in the GitLab interface"
    echo "3. Configure environment variables in GitLab Settings > CI/CD > Variables:"
    echo "   - DEPLOY_ENV (staging/production)"
    echo
    echo "4. Set up branch protection rules:"
    echo "   - Require pipeline success before merge"
    echo "   - Enable code review requirements"
    echo
    echo "5. Test the pipeline by creating a merge request"
    echo
    echo "6. For production deployment, create and push a tag:"
    echo "   git tag v1.0.0 && git push origin v1.0.0"
    echo
    log_info "CI/CD setup complete!"
}

# Main function
main() {
    log_info "Setting up GitLab CI/CD for Leaf Server..."
    echo
    
    check_git
    check_directory
    init_git
    add_remote
    add_files
    create_commit
    push_to_gitlab
    show_next_steps
}

# Run main function
main "$@" 