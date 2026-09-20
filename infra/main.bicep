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

@description('Database connection string')
@secure()
param databaseUrl string

@description('GitHub username for GHCR')
param githubUsername string = 'shivang-7135'

// Resource Names
var logAnalyticsName = '${environmentName}-logs'
var appInsightsName = '${environmentName}-insights'
var keyVaultName = '${environmentName}-kv'
var containerAppEnvName = '${environmentName}-env'
var backendAppName = '${environmentName}-backend'
var frontendAppName = '${environmentName}-frontend'
var backendSharedSecret = 'lensr_sec_${uniqueString(resourceGroup().id)}'

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

// 5. Backend Container App Module
module backendApp 'backendApp.bicep' = {
  name: 'backendAppDeployment'
  params: {
    location: location
    backendAppName: backendAppName
    containerAppEnvId: containerAppEnv.id
    githubToken: githubToken
    githubUsername: githubUsername
    backendImage: backendImage
    frontendAppName: frontendAppName
    envDefaultDomain: containerAppEnv.properties.defaultDomain
    backendSharedSecret: backendSharedSecret
    serperApiKey: keyVault.getSecret('SERPER-API-KEY')
    databaseUrl: keyVault.getSecret('DATABASE-URL')
    awsAccessKeyId: keyVault.getSecret('AWS-ACCESS-KEY-ID')
    awsSecretAccessKey: keyVault.getSecret('AWS-SECRET-ACCESS-KEY')
    awsRegion: keyVault.getSecret('AWS-REGION')
    bedrockModelReasoning: keyVault.getSecret('BEDROCK-MODEL-REASONING')
    bedrockModelRouter: keyVault.getSecret('BEDROCK-MODEL-ROUTER')
  }
}

var betterAuthSecret = 'lensr_auth_${uniqueString(resourceGroup().id)}'

// 6. Frontend Container App
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      secrets: [
        { name: 'ghcr-password', value: githubToken }
        {
          name: 'database-url'
          value: databaseUrl
        }
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
        env: [
          {
            name: 'BACKEND_BASE_URL'
            value: 'https://${backendAppName}.${containerAppEnv.properties.defaultDomain}'
          }
          {
            name: 'BACKEND_SHARED_SECRET'
            value: backendSharedSecret
          }
          {
            name: 'VITE_SUPABASE_URL'
            value: 'https://ovadmzrtaawhqvtxbwde.supabase.co'
          }
          {
            name: 'VITE_SUPABASE_ANON_KEY'
            value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92YWRtenJ0YWF3aHF2dHhid2RlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNjg3NjAsImV4cCI6MjA5Njk0NDc2MH0.pTDaoYRoiLUdWSY8cJcyzE4immN5uY8XL3QOpKQ8Al0'
          }
          {
            name: 'DATABASE_URL'
            secretRef: 'database-url'
          }
          {
            name: 'BETTER_AUTH_SECRET'
            value: betterAuthSecret
          }
          {
            name: 'BETTER_AUTH_URL'
            value: 'https://${frontendAppName}.${containerAppEnv.properties.defaultDomain}'
          }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// 7. Key Vault Access Policy
resource keyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-02-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: 'da5c19fd-d2e7-4dc3-b915-17ebe3960f16'
        permissions: {
          secrets: [
            'get'
            'list'
            'set'
            'delete'
          ]
        }
      }
    ]
  }
}
