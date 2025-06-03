# Tokyo Weather API

This project implements an API to fetch weather data for Tokyo using OpenWeatherMap API.

## Architecture

The API is built using the following AWS services:

- **API Gateway**: Provides the REST API endpoint
- **Lambda**: Handles the business logic for fetching weather data
- **Systems Manager Parameter Store**: Securely stores the OpenWeatherMap API key
- **DynamoDB**: Caches weather data to reduce API calls to OpenWeatherMap

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────────┐
│  API        │     │  Lambda     │     │  OpenWeatherMap     │
│  Gateway    │────▶│  Function   │────▶│  API                │
└─────────────┘     └─────────────┘     └─────────────────────┘
                          │
                          │
                    ┌─────▼─────┐     ┌─────────────┐
                    │  SSM      │     │  DynamoDB   │
                    │  Param    │     │  (キャッシュ) │
                    │  Store    │     │             │
                    └───────────┘     └─────────────┘
```

## API Endpoints

- `GET /weather` - Returns the current weather for Tokyo
- `GET /tokyo` - Alternative endpoint that also returns Tokyo weather

## Deployment Instructions

1. **Prerequisites**:
   - Get an API key from [OpenWeatherMap](https://openweathermap.org/api)
   - Configure AWS CLI with appropriate credentials

2. **Deploy the stack**:
   ```
   npm run build
   cdk deploy TokyoWeatherApiStack
   ```

3. **Set the API key**:
   After deployment, update the SSM parameter with your actual OpenWeatherMap API key:
   ```
   aws ssm put-parameter --name "/tokyo-weather-api/openweathermap-api-key" --type "SecureString" --value "YOUR_API_KEY" --overwrite
   ```

## Testing the API

After deployment, you can test the API using curl:

```
curl https://[your-api-id].execute-api.[region].amazonaws.com/prod/weather
```

Or using the Tokyo-specific endpoint:

```
curl https://[your-api-id].execute-api.[region].amazonaws.com/prod/tokyo
```

## Caching Strategy

The API implements a caching strategy to reduce calls to the OpenWeatherMap API:

- Weather data is cached in DynamoDB for 1 hour (configurable)
- If cached data exists and is not expired, it will be returned
- If no cache exists or it's expired, fresh data will be fetched from OpenWeatherMap

## Error Handling

The API implements proper error handling for:
- Failed API key retrieval
- OpenWeatherMap API failures
- Cache retrieval/storage failures
