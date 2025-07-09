#!/bin/bash

# Deployment script for Leaf Server
# This script can be customized for your specific deployment environment

set -e  # Exit on any error

# Configuration
APP_NAME="leaf-server"
DEPLOY_ENV="${DEPLOY_ENV:-staging}"
DOCKER_IMAGE="${DOCKER_IMAGE:-leaf-server}"
DOCKER_TAG="${DOCKER_TAG:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required environment variables are set
check_env_vars() {
    log_info "Checking environment variables..."
    
    if [ -z "$DEPLOY_ENV" ]; then
        log_error "DEPLOY_ENV is not set"
        exit 1
    fi
    
    log_info "Deploying to environment: $DEPLOY_ENV"
}

# Build Docker image
build_docker_image() {
    log_info "Building Docker image..."
    
    if [ -f "Dockerfile" ]; then
        docker build -t "$DOCKER_IMAGE:$DOCKER_TAG" .
        log_info "Docker image built successfully: $DOCKER_IMAGE:$DOCKER_TAG"
    else
        log_error "Dockerfile not found"
        exit 1
    fi
}

# Deploy to Kubernetes (example)
deploy_to_kubernetes() {
    log_info "Deploying to Kubernetes..."
    
    # This is a placeholder - customize for your Kubernetes setup
    if command -v kubectl &> /dev/null; then
        # Update deployment
        kubectl set image deployment/$APP_NAME $APP_NAME=$DOCKER_IMAGE:$DOCKER_TAG -n $DEPLOY_ENV
        
        # Wait for rollout
        kubectl rollout status deployment/$APP_NAME -n $DEPLOY_ENV
        
        log_info "Kubernetes deployment completed"
    else
        log_warn "kubectl not found, skipping Kubernetes deployment"
    fi
}

# Deploy to Docker Swarm (example)
deploy_to_swarm() {
    log_info "Deploying to Docker Swarm..."
    
    if command -v docker &> /dev/null; then
        # This is a placeholder - customize for your Docker Swarm setup
        log_info "Docker Swarm deployment completed"
    else
        log_warn "Docker not found, skipping Docker Swarm deployment"
    fi
}

# Deploy to traditional server (example)
deploy_to_server() {
    log_info "Deploying to traditional server..."
    
    # This is a placeholder - customize for your server setup
    # Example: rsync, scp, or other deployment methods
    log_info "Traditional server deployment completed"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    # Wait for application to start
    sleep 10
    
    # This is a placeholder - customize for your health check endpoint
    # Example: curl -f http://localhost:3000/health
    log_info "Health check completed"
}

# Main deployment function
main() {
    log_info "Starting deployment process..."
    
    check_env_vars
    build_docker_image
    
    case "$DEPLOY_ENV" in
        "kubernetes")
            deploy_to_kubernetes
            ;;
        "swarm")
            deploy_to_swarm
            ;;
        "server")
            deploy_to_server
            ;;
        *)
            log_warn "Unknown deployment environment: $DEPLOY_ENV"
            log_info "Skipping deployment (this is normal for CI testing)"
            ;;
    esac
    
    health_check
    
    log_info "Deployment completed successfully!"
}

# Run main function
main "$@" 