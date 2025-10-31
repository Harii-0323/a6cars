pipeline {
    agent any

    tools {
        // Optional: specify Node.js installation from Jenkins tools config
        nodejs 'NodeJS_20' 
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install') {
            steps {
                script {
                    if (isUnix()) {
                        echo "Installing dependencies on Linux/Unix..."
                        sh 'npm ci'
                    } else {
                        echo "Installing dependencies on Windows..."
                        bat 'npm ci'
                    }
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'npm run lint || true' // don't fail if lint warnings
                    } else {
                        bat 'npm run lint || exit 0'
                    }
                }
            }
        }

        stage('Test') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'npm test'
                    } else {
                        bat 'npm test'
                    }
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'npm run build'
                    } else {
                        bat 'npm run build'
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    if (isUnix()) {
                        sh 'echo "Deploying on Linux environment..."'
                        // Example: sh './deploy.sh'
                    } else {
                        bat 'echo Deploying on Windows environment...'
                        // Example: bat 'deploy.bat'
                    }
                }
            }
        }
    }

    post {
        success {
            echo '✅ Pipeline completed successfully!'
        }
        failure {
            echo '❌ Pipeline failed. Please check the logs.'
        }
    }
}
