import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import axios from 'axios';

// Initialize clients
const ssmClient = new SSMClient();
const ddbClient = new DynamoDBClient();
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// Environment variables
const SSM_PARAM_NAME = process.env.SSM_PARAM_NAME || '';
const CACHE_TABLE_NAME = process.env.CACHE_TABLE_NAME || '';
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10);
const TOKYO_CITY_ID = process.env.TOKYO_CITY_ID || '1850147'; // Tokyo city ID

/**
 * Get OpenWeatherMap API key from SSM Parameter Store
 */
async function getApiKey(): Promise<string> {
  try {
    const response = await ssmClient.send(
      new GetParameterCommand({
        Name: SSM_PARAM_NAME,
        WithDecryption: true,
      })
    );
    return response.Parameter?.Value || '';
  } catch (error) {
    console.error('Error retrieving API key from SSM:', error);
    throw new Error('Failed to retrieve API key');
  }
}

/**
 * Check if we have cached weather data
 */
async function getWeatherFromCache(cityId: string): Promise<any | null> {
  try {
    const response = await ddbDocClient.send(
      new GetCommand({
        TableName: CACHE_TABLE_NAME,
        Key: { cityId },
      })
    );

    // Check if we have a valid cache entry
    if (response.Item) {
      // Check if cache is still valid
      if (response.Item.ttl && response.Item.ttl > Math.floor(Date.now() / 1000)) {
        console.log('Cache hit for city:', cityId);
        return response.Item.weatherData;
      }
      console.log('Cache expired for city:', cityId);
    } else {
      console.log('No cache found for city:', cityId);
    }
    return null;
  } catch (error) {
    console.error('Error retrieving from cache:', error);
    return null; // Continue with API call on cache error
  }
}

/**
 * Store weather data in cache
 */
async function storeWeatherInCache(cityId: string, weatherData: any): Promise<void> {
  try {
    const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_SECONDS;
    
    await ddbDocClient.send(
      new PutCommand({
        TableName: CACHE_TABLE_NAME,
        Item: {
          cityId,
          weatherData,
          ttl,
          timestamp: new Date().toISOString(),
        },
      })
    );
    console.log('Weather data cached for city:', cityId);
  } catch (error) {
    console.error('Error storing in cache:', error);
    // Continue even if caching fails
  }
}

/**
 * Fetch weather data from OpenWeatherMap API
 */
async function fetchWeatherFromApi(apiKey: string, cityId: string): Promise<any> {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?id=${cityId}&appid=${apiKey}&units=metric`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error fetching weather data from API:', error);
    throw new Error('Failed to fetch weather data from OpenWeatherMap');
  }
}

/**
 * Format the weather data for response
 */
function formatWeatherData(data: any): any {
  return {
    city: data.name,
    country: data.sys.country,
    weather: {
      description: data.weather[0].description,
      temperature: data.main.temp,
      feels_like: data.main.feels_like,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      wind: {
        speed: data.wind.speed,
        direction: data.wind.deg,
      },
    },
    timestamp: new Date().toISOString(),
    source: data.cached ? 'cache' : 'api',
  };
}

/**
 * Lambda handler function
 */
export const handler = async (event: any): Promise<any> => {
  console.log('Event:', JSON.stringify(event));
  
  try {
    // Use Tokyo city ID by default
    const cityId = TOKYO_CITY_ID;
    
    // Try to get weather data from cache first
    let weatherData = await getWeatherFromCache(cityId);
    let source = 'cache';
    
    // If not in cache or expired, fetch from API
    if (!weatherData) {
      const apiKey = await getApiKey();
      weatherData = await fetchWeatherFromApi(apiKey, cityId);
      source = 'api';
      
      // Store in cache for future requests
      await storeWeatherInCache(cityId, weatherData);
    }
    
    // Add source information to the weather data
    weatherData.cached = source === 'cache';
    
    // Format the response
    const formattedData = formatWeatherData(weatherData);
    
    // Return successful response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // CORS header
      },
      body: JSON.stringify(formattedData),
    };
  } catch (error: any) {
    console.error('Error:', error);
    
    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // CORS header
      },
      body: JSON.stringify({
        message: 'Error fetching weather data',
        error: error.message,
      }),
    };
  }
};
