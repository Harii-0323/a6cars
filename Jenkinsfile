pipeline {
  agent any
  environment {
    NODE_ENV = 'production'
  }
  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }
    stage('Lint') {
      steps {
        echo 'No linter configured - skipping'
      }
    }
    stage('Test') {
      steps {
        echo 'No tests configured - skipping'
      }
    }
    stage('Build') {
      steps {
        echo 'No build step for this simple app - skipping'
      }
    }
    stage('Deploy') {
      steps {
        echo 'Deployment is environment-specific. Use a post-build job or script.'
      }
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'server.log', allowEmptyArchive: true
      junit allowEmptyResults: true, testResults: '**/test-results.xml'
    }
  }
}
