// ============================================================================
// Lensr Infrastructure as Code (Bicep)
// ============================================================================

@description('The location to deploy the resources to')
param location string = 'swedencentral'

@description('The environment name, used as a prefix for all resources')
param environmentName string = 'lensr'

@description('The container image for the backend')
param backendImage string = 'ghcr.io/shivang-7135/lensr-backend:latest'

@description('The container image for the frontend')
param frontendImage string = 'ghcr.io/shivang-7135/lensr-frontend:latest'

@description('The allowed CORS origins')
param corsAllowOrigin string = 'https://lensr.studio,https://www.lensr.studio'

@description('GitHub PAT for pulling images from GHCR')
@secure()
param githubToken string

@description('GitHub username for GHCR')
param githubUsername string = 'shivang-7135'

// Resource Names
var logAnalyticsName = '${environmentName}-logs'
var appInsightsName = '${environmentName}-insights'
var keyVaultName = '${environmentName}-kv'
var containerAppEnvName = '${environmentName}-env'
var backendAppName = '${environmentName}-backend'
var frontendAppName = '${environmentName}-frontend'

// 1. Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
    workspaceCapping: { dailyQuotaGb: 1 }
  }
}

// 2. Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// 3. Container Apps Environment
resource containerAppEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerAppEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// 4. Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    accessPolicies: [] 
  }
}

// 5. Backend Container App
resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      secrets: [
        { name: 'ghcr-password', value: githubToken }
      ]
      registries: [
        {
          server: 'ghcr.io'
          username: githubUsername
          passwordSecretRef: 'ghcr-password'
        }
      ]
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
      }
    }
    template: {
      containers: [{
        name: backendAppName
        image: backendImage
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// 6. Frontend Container App
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      secrets: [
        { name: 'ghcr-password', value: githubToken }
      ]
      registries: [
        {
          server: 'ghcr.io'
          username: githubUsername
          passwordSecretRef: 'ghcr-password'
        }
      ]
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
    }
    template: {
      containers: [{
        name: frontendAppName
        image: frontendImage
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}



