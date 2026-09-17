// ============================================================================
// Lensr Infrastructure as Code (Bicep)
// ============================================================================
// This template provisions the ultra-low-cost Azure infrastructure for Lensr:
// - Log Analytics Workspace & Application Insights (for telemetry & tracing)
// - Key Vault (for secure secret storage)
// - Container Apps Environment (Consumption plan)
// - Container App (FastAPI backend) with Managed Identity and Key Vault integration
// - Static Web App (Free tier for TanStack Start frontend)
//
// Deployment Command:
// az deployment group create --resource-group rg-lensr --template-file main.bicep --parameters parameters.json
// ============================================================================

@description('The location to deploy the resources to')
param location string = 'westeurope'

@description('The environment name, used as a prefix for all resources')
param environmentName string = 'lensr'

@description('The container image for the backend')
param containerImage string = 'ghcr.io/shivangsinha/lensr-backend:latest'

@description('The allowed CORS origins')
param corsAllowOrigin string = 'https://lensr.studio,https://www.lensr.studio'

// Resource Names
var logAnalyticsName = '${environmentName}-logs'
var appInsightsName = '${environmentName}-insights'
var keyVaultName = '${environmentName}-kv'
var containerAppEnvName = '${environmentName}-env'
var containerAppName = '${environmentName}-backend'
var staticWebAppName = '${environmentName}-frontend'

// 1. Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: 1
    }
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
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    accessPolicies: [] // Access policy is added via Microsoft.KeyVault/vaults/accessPolicies resource below to avoid circular dependency
  }
}

// 5. Container App
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: containerAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
      }
      secrets: [
        {
          name: 'aws-access-key-id'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/AWS-ACCESS-KEY-ID'
          identity: 'system'
        }
        {
          name: 'aws-secret-access-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/AWS-SECRET-ACCESS-KEY'
          identity: 'system'
        }
        {
          name: 'aws-region'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/AWS-REGION'
          identity: 'system'
        }
        {
          name: 'serper-api-key'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/SERPER-API-KEY'
          identity: 'system'
        }
        {
          name: 'backend-shared-secret'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/BACKEND-SHARED-SECRET'
          identity: 'system'
        }
        {
          name: 'database-url'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/DATABASE-URL'
          identity: 'system'
        }
        {
          name: 'bedrock-model-reasoning'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/BEDROCK-MODEL-REASONING'
          identity: 'system'
        }
        {
          name: 'bedrock-model-router'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/BEDROCK-MODEL-ROUTER'
          identity: 'system'
        }
        {
          name: 'applicationinsights-connection-string'
          keyVaultUrl: '${keyVault.properties.vaultUri}secrets/APPLICATIONINSIGHTS-CONNECTION-STRING'
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: containerAppName
          image: containerImage
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'CORS_ALLOW_ORIGIN'
              value: corsAllowOrigin
            }
            {
              name: 'AZURE_KEYVAULT_URL'
              value: keyVault.properties.vaultUri
            }
            {
              name: 'AWS_ACCESS_KEY_ID'
              secretRef: 'aws-access-key-id'
            }
            {
              name: 'AWS_SECRET_ACCESS_KEY'
              secretRef: 'aws-secret-access-key'
            }
            {
              name: 'AWS_REGION'
              secretRef: 'aws-region'
            }
            {
              name: 'SERPER_API_KEY'
              secretRef: 'serper-api-key'
            }
            {
              name: 'BACKEND_SHARED_SECRET'
              secretRef: 'backend-shared-secret'
            }
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'BEDROCK_MODEL_REASONING'
              secretRef: 'bedrock-model-reasoning'
            }
            {
              name: 'BEDROCK_MODEL_ROUTER'
              secretRef: 'bedrock-model-router'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              secretRef: 'applicationinsights-connection-string'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                port: 8000
                path: '/healthz'
              }
              initialDelaySeconds: 15
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 2
      }
    }
  }
}

// 5.1 Key Vault Access Policy for Container App Identity
resource keyVaultAccessPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-02-01' = {
  parent: keyVault
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: containerApp.identity.principalId
        permissions: {
          secrets: [
            'get'
          ]
        }
      }
    ]
  }
}

// 6. Static Web App
resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    branch: 'production'
  }
}
