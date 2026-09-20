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
// 6. Frontend Container App Module
module frontendApp 'frontendApp.bicep' = {
  name: 'frontendAppDeployment'
  params: {
    location: location
    frontendAppName: frontendAppName
    containerAppEnvId: containerAppEnv.id
    envDefaultDomain: containerAppEnv.properties.defaultDomain
    githubToken: githubToken
    githubUsername: githubUsername
    frontendImage: frontendImage
    backendAppName: backendAppName
    backendSharedSecret: backendSharedSecret
    betterAuthSecret: betterAuthSecret
    databaseUrl: keyVault.getSecret('DATABASE-URL')
    googleClientId: keyVault.getSecret('GOOGLE-CLIENT-ID')
    googleClientSecret: keyVault.getSecret('GOOGLE-CLIENT-SECRET')
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
