import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export class TokyoWeatherApiStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create SSM Parameter for OpenWeatherMap API key
    // Note: The actual API key will be set manually after deployment
    const apiKeyParam = new ssm.StringParameter(this, 'OpenWeatherMapApiKey', {
      parameterName: '/tokyo-weather-api/openweathermap-api-key',
      stringValue: 'dummy-value-to-be-updated-after-deployment',
      description: 'API Key for OpenWeatherMap',
      type: ssm.ParameterType.SECURE_STRING,
    });

    // Create DynamoDB table for caching weather data
    const weatherCacheTable = new dynamodb.Table(this, 'WeatherCache', {
      partitionKey: { name: 'cityId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl', // TTL for cache expiration
      removalPolicy: props?.env?.account === 'production' 
        ? undefined  // Keep the default in production
        : undefined, // In non-production, you might want to use DESTROY
    });

    // Create Lambda function for fetching weather data
    const weatherFunction = new lambda.Function(this, 'TokyoWeatherFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/tokyo-weather')),
      timeout: Duration.seconds(10),
      environment: {
        SSM_PARAM_NAME: apiKeyParam.parameterName,
        CACHE_TABLE_NAME: weatherCacheTable.tableName,
        CACHE_TTL_SECONDS: '3600', // 1 hour cache
        TOKYO_CITY_ID: '1850147', // OpenWeatherMap city ID for Tokyo
      },
    });

    // Grant Lambda function permissions to read from SSM Parameter Store
    apiKeyParam.grantRead(weatherFunction);

    // Grant Lambda function permissions to read/write to DynamoDB
    weatherCacheTable.grantReadWriteData(weatherFunction);

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'TokyoWeatherApi', {
      restApiName: 'Tokyo Weather API',
      description: 'API to fetch weather data for Tokyo',
      deployOptions: {
        stageName: 'prod',
      },
      // Enable CORS
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Create API resource and method
    const weatherResource = api.root.addResource('weather');
    weatherResource.addMethod('GET', new apigateway.LambdaIntegration(weatherFunction), {
      apiKeyRequired: false, // Set to true if you want to require API key
    });

    // Add a specific Tokyo endpoint for clarity
    const tokyoResource = api.root.addResource('tokyo');
    tokyoResource.addMethod('GET', new apigateway.LambdaIntegration(weatherFunction), {
      apiKeyRequired: false,
    });
  }
}
