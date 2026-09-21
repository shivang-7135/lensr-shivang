param location string
param backendAppName string
param containerAppEnvId string
param githubToken string
param githubUsername string
param backendImage string
param frontendAppName string
param envDefaultDomain string
param backendSharedSecret string

@secure()
param serperApiKey string
@secure()
param databaseUrl string
@secure()
param awsAccessKeyId string
@secure()
param awsSecretAccessKey string
@secure()
param awsRegion string
@secure()
param bedrockModelReasoning string
@secure()
param bedrockModelRouter string
@secure()
param bedrockModelVision string
@secure()
param appInsightsConnectionString string
@secure()
param phoenixApiKey string

resource backendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: backendAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnvId
    configuration: {
      secrets: [
        { name: 'ghcr-password', value: githubToken }
        { name: 'serper-api-key', value: serperApiKey }
        { name: 'database-url', value: databaseUrl }
        { name: 'aws-access-key-id', value: awsAccessKeyId }
        { name: 'aws-secret-access-key', value: awsSecretAccessKey }
        { name: 'aws-region', value: awsRegion }
        { name: 'bedrock-model-reasoning', value: bedrockModelReasoning }
        { name: 'bedrock-model-router', value: bedrockModelRouter }
        { name: 'bedrock-model-vision', value: bedrockModelVision }
        { name: 'appinsights-connection-string', value: appInsightsConnectionString }
        { name: 'phoenix-api-key', value: phoenixApiKey }
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
        env: [
          {
            name: 'CORS_ALLOW_ORIGIN'
            value: 'https://${frontendAppName}.${envDefaultDomain},https://lensr.studio,https://www.lensr.studio'
          }
          {
            name: 'BACKEND_SHARED_SECRET'
            value: backendSharedSecret
          }
          {
            name: 'SERPER_API_KEY'
            secretRef: 'serper-api-key'
          }
          {
            name: 'DATABASE_URL'
            secretRef: 'database-url'
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
            name: 'BEDROCK_MODEL_REASONING'
            secretRef: 'bedrock-model-reasoning'
          }
          {
            name: 'BEDROCK_MODEL_ROUTER'
            secretRef: 'bedrock-model-router'
          }
          {
            name: 'BEDROCK_MODEL_VISION'
            secretRef: 'bedrock-model-vision'
          }
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            secretRef: 'appinsights-connection-string'
          }
          {
            name: 'PHOENIX_API_KEY'
            secretRef: 'phoenix-api-key'
          }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}
