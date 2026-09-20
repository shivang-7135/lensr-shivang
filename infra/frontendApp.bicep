param location string
param frontendAppName string
param containerAppEnvId string
param envDefaultDomain string
param githubToken string
param githubUsername string
param frontendImage string
param backendAppName string
param backendSharedSecret string
param betterAuthSecret string

@secure()
param databaseUrl string
@secure()
param googleClientId string
@secure()
param googleClientSecret string

resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: frontendAppName
  location: location
  properties: {
    managedEnvironmentId: containerAppEnvId
    configuration: {
      secrets: [
        { name: 'ghcr-password', value: githubToken }
        { name: 'database-url', value: databaseUrl }
        { name: 'google-client-id', value: googleClientId }
        { name: 'google-client-secret', value: googleClientSecret }
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
            value: 'https://${backendAppName}.${envDefaultDomain}'
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
            value: 'https://${frontendAppName}.${envDefaultDomain}'
          }
          {
            name: 'GOOGLE_CLIENT_ID'
            secretRef: 'google-client-id'
          }
          {
            name: 'GOOGLE_CLIENT_SECRET'
            secretRef: 'google-client-secret'
          }
        ]
      }]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}
