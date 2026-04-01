import { useEffect, useState } from "react";

export interface BlackSeaLocation {
  id: string;
  latitude: number;
  longitude: number;
}

export interface DailyForecast {
  date: string;
  weatherCode: number;
  maxTemp: number;
  minTemp: number;
  rainChance: number;
  maxWind: number;
}

export interface HourlyOutlook {
  time: string;
  temperature: number;
  windSpeed: number;
  rainChance: number;
  waveHeight: number | null;
}

export interface MarineConditions {
  waveHeight: number | null;
  waveDirection: number | null;
  wavePeriod: number | null;
  seaTemperature: number | null;
}

export interface WeatherSnapshot {
  updatedAt: string;
  timezone: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    windSpeed: number;
    weatherCode: number;
  };
  marine: MarineConditions;
  sun: {
    sunrise: string;
    sunset: string;
  };
  daily: DailyForecast[];
  hourly: HourlyOutlook[];
}

interface WeatherState {
  snapshot: WeatherSnapshot | null;
  isLoading: boolean;
  errorCode: "forecastUnavailable" | "invalidResponse" | "loadFailed" | null;
}

interface ForecastResponse {
  timezone_abbreviation?: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    sunrise: string[];
    sunset: string[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    precipitation_probability: number[];
  };
}

interface MarineResponse {
  hourly?: {
    time: string[];
    wave_height?: Array<number | null>;
    wave_direction?: Array<number | null>;
    wave_period?: Array<number | null>;
    sea_surface_temperature?: Array<number | null>;
  };
}

function getNearestIndex(times: string[] | undefined, target: string) {
  if (!times || times.length === 0) {
    return -1;
  }

  const exactIndex = times.indexOf(target);
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const targetTime = new Date(target).getTime();
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const distance = Math.abs(new Date(time).getTime() - targetTime);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function getMarineValue(
  marine: MarineResponse["hourly"] | undefined,
  key: "wave_height" | "wave_direction" | "wave_period" | "sea_surface_temperature",
  index: number,
) {
  if (!marine || index < 0) {
    return null;
  }

  const series = marine[key];
  if (!series || index >= series.length) {
    return null;
  }

  return series[index] ?? null;
}

export function useBlackSeaWeather(location: BlackSeaLocation) {
  const [state, setState] = useState<WeatherState>({
    snapshot: null,
    isLoading: true,
    errorCode: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadWeather() {
      setState((currentState) => ({
        ...currentState,
        isLoading: true,
        errorCode: null,
      }));

      const forecastParams = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code",
        hourly: "temperature_2m,wind_speed_10m,precipitation_probability",
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset",
        forecast_days: "7",
        timezone: "auto",
      });

      const marineParams = new URLSearchParams({
        latitude: String(location.latitude),
        longitude: String(location.longitude),
        hourly:
          "wave_height,wave_direction,wave_period,sea_surface_temperature",
        forecast_days: "3",
        timezone: "auto",
      });

      try {
        const [forecastResult, marineResult] = await Promise.allSettled([
          fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`, {
            signal: controller.signal,
          }),
          fetch(
            `https://marine-api.open-meteo.com/v1/marine?${marineParams.toString()}`,
            { signal: controller.signal },
          ),
        ]);

        if (forecastResult.status !== "fulfilled") {
          throw new Error("forecastUnavailable");
        }

        const forecastResponse = forecastResult.value;
        if (!forecastResponse.ok) {
          throw new Error("invalidResponse");
        }

        const forecast = (await forecastResponse.json()) as ForecastResponse;
        const marine =
          marineResult.status === "fulfilled" && marineResult.value.ok
            ? ((await marineResult.value.json()) as MarineResponse)
            : null;

        const currentHourIndex = getNearestIndex(
          forecast.hourly.time,
          forecast.current.time,
        );
        const marineHourIndex = getNearestIndex(
          marine?.hourly?.time,
          forecast.current.time,
        );

        const hourlyOutlook = forecast.hourly.time
          .slice(Math.max(currentHourIndex, 0), Math.max(currentHourIndex, 0) + 8)
          .map((time, offset) => {
            const forecastIndex = Math.max(currentHourIndex, 0) + offset;
            const marineIndex = getNearestIndex(marine?.hourly?.time, time);

            return {
              time,
              temperature: forecast.hourly.temperature_2m[forecastIndex],
              windSpeed: forecast.hourly.wind_speed_10m[forecastIndex],
              rainChance: forecast.hourly.precipitation_probability[forecastIndex],
              waveHeight: getMarineValue(marine?.hourly, "wave_height", marineIndex),
            } satisfies HourlyOutlook;
          });

        const snapshot: WeatherSnapshot = {
          updatedAt: forecast.current.time,
          timezone: forecast.timezone_abbreviation ?? "local",
          current: {
            temperature: forecast.current.temperature_2m,
            apparentTemperature: forecast.current.apparent_temperature,
            humidity: forecast.current.relative_humidity_2m,
            windSpeed: forecast.current.wind_speed_10m,
            weatherCode: forecast.current.weather_code,
          },
          marine: {
            waveHeight: getMarineValue(marine?.hourly, "wave_height", marineHourIndex),
            waveDirection: getMarineValue(
              marine?.hourly,
              "wave_direction",
              marineHourIndex,
            ),
            wavePeriod: getMarineValue(marine?.hourly, "wave_period", marineHourIndex),
            seaTemperature: getMarineValue(
              marine?.hourly,
              "sea_surface_temperature",
              marineHourIndex,
            ),
          },
          sun: {
            sunrise: forecast.daily.sunrise[0],
            sunset: forecast.daily.sunset[0],
          },
          daily: forecast.daily.time.map((date, index) => ({
            date,
            weatherCode: forecast.daily.weather_code[index],
            maxTemp: forecast.daily.temperature_2m_max[index],
            minTemp: forecast.daily.temperature_2m_min[index],
            rainChance: forecast.daily.precipitation_probability_max[index],
            maxWind: forecast.daily.wind_speed_10m_max[index],
          })),
          hourly: hourlyOutlook,
        };

        setState({
          snapshot,
          isLoading: false,
          errorCode: null,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const errorCode =
          error instanceof Error &&
          (error.message === "forecastUnavailable" ||
            error.message === "invalidResponse")
            ? error.message
            : "loadFailed";

        setState((currentState) => ({
          snapshot: currentState.snapshot,
          isLoading: false,
          errorCode,
        }));
      }
    }

    void loadWeather();

    return () => {
      controller.abort();
    };
  }, [location.id, location.latitude, location.longitude]);

  return state;
}