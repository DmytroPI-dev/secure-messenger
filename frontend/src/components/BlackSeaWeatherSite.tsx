import {
  Box,
  Button,
  Field,
  Heading,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type BlackSeaLocation,
  useBlackSeaWeather,
} from "@/hooks/useBlackSeaWeather";
import {
  getSupportedLanguage,
  localeByLanguage,
  supportedLanguages,
} from "@/i18n/resources";
import { changeAppLanguage } from "@/i18n";
import { ColorModeButton } from "@/components/ui/color-mode";
import {
  hashPhrase,
  normalizeCaseSensitiveSecretPhrase,
  normalizeSecretPhrase,
} from "@/utils/crypto";

export interface SecretAccessRequest {
  roomId: string;
  stationName: string;
  dateCode: string;
}

interface BlackSeaWeatherSiteProps {
  onUnlockRequest: (access: SecretAccessRequest) => void;
}

const blackSeaLocations: BlackSeaLocation[] = [
  { id: "odessa", latitude: 46.4825, longitude: 30.7233 },
  { id: "chornomorsk", latitude: 46.3019, longitude: 30.6556 },
  { id: "yuzhne", latitude: 46.6221, longitude: 31.1017 },
  { id: "skadovsk", latitude: 46.1092, longitude: 32.9117 },
  { id: "sulina", latitude: 45.1552, longitude: 29.6578 },
  { id: "constanta", latitude: 44.1598, longitude: 28.6348 },
  { id: "mangalia", latitude: 43.8167, longitude: 28.5833 },
  { id: "balchik", latitude: 43.4092, longitude: 28.1628 },
  { id: "varna", latitude: 43.2141, longitude: 27.9147 },
  { id: "nessebar", latitude: 42.6598, longitude: 27.7360 },
  { id: "burgas", latitude: 42.5048, longitude: 27.4626 },
  { id: "sozopol", latitude: 42.4239, longitude: 27.6954 },
  { id: "tsarevo", latitude: 42.1697, longitude: 27.8453 },
  { id: "igneada", latitude: 41.8864, longitude: 27.9861 },
  { id: "sile", latitude: 41.1744, longitude: 29.6133 },
  { id: "zonguldak", latitude: 41.4564, longitude: 31.7987 },
  { id: "amasra", latitude: 41.7461, longitude: 32.3864 },
  { id: "sinop", latitude: 42.0268, longitude: 35.1512 },
  { id: "samsun", latitude: 41.2867, longitude: 36.3300 },
  { id: "ordu", latitude: 40.9839, longitude: 37.8764 },
  { id: "giresun", latitude: 40.9170, longitude: 38.3927 },
  { id: "trabzon", latitude: 41.0015, longitude: 39.7178 },
  { id: "rize", latitude: 41.0255, longitude: 40.5177 },
  { id: "hopa", latitude: 41.3908, longitude: 41.4197 },
  { id: "batumi", latitude: 41.6168, longitude: 41.6367 },
  { id: "kobuleti", latitude: 41.8214, longitude: 41.7753 },
  { id: "poti", latitude: 42.1462, longitude: 41.6719 },
  { id: "sochi", latitude: 43.6028, longitude: 39.7342 },
  { id: "tuapse", latitude: 44.1053, longitude: 39.0782 },
  { id: "gelendzhik", latitude: 44.5630, longitude: 38.0790 },
  { id: "novorossiysk", latitude: 44.7235, longitude: 37.7686 },
  { id: "anapa", latitude: 44.8949, longitude: 37.3166 },
];

const recentStationsStorageKey = "black-sea-recent-stations";
const shortlistSize = 9;

function readRecentLocationIds() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const rawValue = window.localStorage.getItem(recentStationsStorageKey);

    if (!rawValue) {
      return [];
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    const validLocationIds = new Set(blackSeaLocations.map((location) => location.id));

    return parsedValue
      .filter((value): value is string => typeof value === "string")
      .filter((value) => validLocationIds.has(value))
      .slice(0, shortlistSize);
  } catch {
    return [];
  }
}

function mergeRecentLocationIds(currentIds: string[], nextId: string) {
  return [nextId, ...currentIds.filter((id) => id !== nextId)].slice(0, shortlistSize);
}

type HeroVideoAsset = {
  id: string;
  mp4: string;
  webm: string;
  poster: string;
};

const heroVideos: HeroVideoAsset[] = [
  {
    id: "hero",
    mp4: "/media/optimized/black-sea-hero.mp4",
    webm: "/media/optimized/black-sea-hero.webm",
    poster: "/media/optimized/black-sea-hero.webp",
  },
  {
    id: "sunset",
    mp4: "/media/optimized/black-sea-sunset.mp4",
    webm: "/media/optimized/black-sea-sunset.webm",
    poster: "/media/optimized/black-sea-sunset.webp",
  },
  {
    id: "history",
    mp4: "/media/optimized/black-sea-history.mp4",
    webm: "/media/optimized/black-sea-history.webm",
    poster: "/media/optimized/black-sea-history.webp",
  },
  {
    id: "nessebar",
    mp4: "/media/optimized/black-sea-nessebar.mp4",
    webm: "/media/optimized/black-sea-nessebar.webm",
    poster: "/media/optimized/black-sea-nessebar.webp",
  },
];

function buildRandomVideoQueue(previousFirstId?: string) {
  const queue = [...heroVideos];

  for (let index = queue.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }

  if (previousFirstId && queue.length > 1 && queue[0]?.id === previousFirstId) {
    [queue[0], queue[1]] = [queue[1], queue[0]];
  }

  return queue;
}

function formatDayLabel(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}

function formatTimeLabel(date: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatAccessDateCode(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);

  return `${day}${month}${year}`;
}

function formatMetric(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value)) {
    return "--";
  }

  return `${Math.round(value * 10) / 10}${unit}`;
}

function MetricTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Box className="weather-card weather-card--compact">
      <Text className="weather-label">{label}</Text>
      <Text className="weather-value">{value}</Text>
    </Box>
  );
}

export function BlackSeaWeatherSite({
  onUnlockRequest,
}: BlackSeaWeatherSiteProps) {
  const { t, i18n } = useTranslation();
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState(
    blackSeaLocations[0].id,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [recentLocationIds, setRecentLocationIds] = useState<string[]>(() =>
    readRecentLocationIds(),
  );
  const [heroVideoQueue, setHeroVideoQueue] = useState<HeroVideoAsset[]>(() =>
    buildRandomVideoQueue(),
  );
  const [heroVideoIndex, setHeroVideoIndex] = useState(0);

  const activeLanguage = getSupportedLanguage(i18n.resolvedLanguage);
  const locale = localeByLanguage[activeLanguage];
  const knownStationKeys = new Set(
    blackSeaLocations.flatMap((location) => [
      normalizeSecretPhrase(location.id),
      normalizeSecretPhrase(t(`weather.locations.${location.id}.name`)),
    ]),
  );

  const selectedLocation =
    blackSeaLocations.find((location) => location.id === selectedLocationId) ??
    blackSeaLocations[0];

  const filteredLocations = blackSeaLocations.filter((location) => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return [
      t(`weather.locations.${location.id}.name`),
      t(`weather.locations.${location.id}.country`),
      t(`weather.locations.${location.id}.summary`),
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const defaultLocations = (recentLocationIds.length > 0
    ? recentLocationIds
        .map((locationId) =>
          blackSeaLocations.find((location) => location.id === locationId),
        )
        .filter((location): location is BlackSeaLocation => location !== undefined)
    : blackSeaLocations.slice(0, shortlistSize));

  const visibleLocations = searchQuery.trim()
    ? filteredLocations
    : defaultLocations;

  const { snapshot, isLoading, errorCode } = useBlackSeaWeather(selectedLocation);
  const currentHeroVideo = heroVideoQueue[heroVideoIndex] ?? heroVideos[0];

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      recentStationsStorageKey,
      JSON.stringify(recentLocationIds),
    );
  }, [recentLocationIds]);

  useEffect(() => {
    const videoElement = heroVideoRef.current;
    if (!videoElement) {
      return;
    }

    videoElement.defaultPlaybackRate = 0.5;
    videoElement.playbackRate = 0.5;
    void videoElement.play().catch(() => undefined);
  }, [currentHeroVideo]);

  useEffect(() => {
    return undefined;
  }, []);

  const handleLanguageSwitch = (language: string) => {
    void changeAppLanguage(language);
  };

  const translateWeatherCode = (code: number) =>
    t(`weatherCodes.${code}`, { defaultValue: t("weatherCodes.default") });

  const handleHeroVideoEnded = () => {
    if (heroVideoIndex < heroVideoQueue.length - 1) {
      setHeroVideoIndex(heroVideoIndex + 1);
      return;
    }

    setHeroVideoQueue(buildRandomVideoQueue(currentHeroVideo.id));
    setHeroVideoIndex(0);
  };

  const buildSecretAccessRequest = async (
    rawValue: string,
  ): Promise<SecretAccessRequest | null> => {
    const trimmedValue = rawValue.trim();
    const dateCode = formatAccessDateCode();

    if (!trimmedValue.endsWith(dateCode) || /\s/u.test(trimmedValue)) {
      return null;
    }

    const stationName = trimmedValue.slice(0, -dateCode.length);
    const normalizedStationKey = normalizeSecretPhrase(stationName);
    const caseSensitivePhrase = normalizeCaseSensitiveSecretPhrase(trimmedValue);

    if (
      stationName.length < 4 ||
      normalizedStationKey.length < 4 ||
      normalizedStationKey === "" ||
      knownStationKeys.has(normalizedStationKey)
    ) {
      return null;
    }

    const roomId = await hashPhrase(caseSensitivePhrase);
    return {
      roomId,
      stationName,
      dateCode,
    };
  };

  const handleSearchSubmit = async () => {
    const access = await buildSecretAccessRequest(searchQuery);

    if (!access) {
      return;
    }

    setSearchQuery("");
    onUnlockRequest(access);
  };

  const handleLocationSelect = (locationId: string) => {
    setSelectedLocationId(locationId);
    setRecentLocationIds((currentIds) => mergeRecentLocationIds(currentIds, locationId));

    if (searchQuery.trim()) {
      setSearchQuery("");
    }
  };

  return (
    <Box className="weather-shell">
      <Box className="weather-shell__aurora" />
      <Box className="weather-shell__grid">
        <Stack gap={{ base: 6, lg: 8 }}>
          <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
            <Text className="weather-brand">{t("weather.kicker")}</Text>
            <HStack gap={3} align="center" className="language-map">
              <Text className="weather-language-label">
                {t("language.label")}
              </Text>
              {supportedLanguages.map((language) => {
                const isActive = activeLanguage === language;

                return (
                  <Box
                    as="span"
                    key={language}
                    tabIndex={0}
                    onClick={() => {
                      handleLanguageSwitch(language);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleLanguageSwitch(language);
                      }
                    }}
                    className={isActive ? "language-pill language-pill--active" : "language-pill"}
                  >
                    {t(`language.${language}`)}
                  </Box>
                );
              })}
              <ColorModeButton
                className="theme-toggle"
                display={{ base: "none", md: "inline-flex" }}
              />
            </HStack>
          </HStack>

          <Box className="weather-hero">
            <Stack gap={6}>
              <Stack gap={3} maxW="42rem">
                <HStack align="flex-start" gap={3} display={{ base: "flex", md: "none" }}>
                  <ColorModeButton className="theme-toggle" flexShrink={0} mt={1} />
                  <Heading as="h1" className="weather-title">
                    {t("weather.heroTitle")}
                  </Heading>
                </HStack>
                <Heading as="h1" className="weather-title" display={{ base: "none", md: "block" }}>
                  {t("weather.heroTitle")}
                </Heading>
                <Text className="weather-description">
                  {t("weather.heroDescription")}
                </Text>
              </Stack>

              <Box className="weather-search-panel">
                <Field.Root>
                  <Field.Label color="var(--weather-text-main)">{t("weather.searchLabel")}</Field.Label>
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSearchSubmit();
                      }
                    }}
                    placeholder={t("weather.searchPlaceholder")}
                    size="lg"
                    bg="var(--weather-input-bg)"
                    borderColor="var(--weather-input-border)"
                    color="var(--weather-input-text)"
                    _placeholder={{ color: "var(--weather-input-placeholder)" }}
                  />
                </Field.Root>

                <Box className="station-grid">
                  {visibleLocations.length === 0 ? (
                    <Box className="weather-card weather-card--compact">
                      <Text className="weather-label">{t("weather.noStationMatchTitle")}</Text>
                      <Text color="var(--weather-text-muted)">
                        {t("weather.noStationMatchBody")}
                      </Text>
                    </Box>
                  ) : (
                    visibleLocations.map((location) => {
                      const isActive = location.id === selectedLocation.id;

                      return (
                        <Button
                          key={location.id}
                          onClick={() => handleLocationSelect(location.id)}
                          className={isActive ? "station-chip station-chip--active" : "station-chip"}
                        >
                          <Stack gap={0} alignItems="flex-start">
                            <Text fontWeight="600">{t(`weather.locations.${location.id}.name`)}</Text>
                            <Text fontSize="0.78rem" color="inherit">
                              {t(`weather.locations.${location.id}.country`)}
                            </Text>
                          </Stack>
                        </Button>
                      );
                    })
                  )}
                </Box>
              </Box>
            </Stack>

            <Box className="coast-stage">
              <video
                key={currentHeroVideo.id}
                ref={heroVideoRef}
                className="coast-stage__video"
                autoPlay
                muted
                playsInline
                preload="metadata"
                poster={currentHeroVideo.poster}
                aria-hidden="true"
                onLoadedMetadata={() => {
                  if (heroVideoRef.current) {
                    heroVideoRef.current.defaultPlaybackRate = 0.5;
                    heroVideoRef.current.playbackRate = 0.5;
                  }
                }}
                onEnded={handleHeroVideoEnded}
              >
                <source src={currentHeroVideo.webm} type="video/webm" />
                <source src={currentHeroVideo.mp4} type="video/mp4" />
              </video>
              <Box className="coast-stage__mist" />
              <Box className="coast-stage__waterline" />
              <Stack gap={3} className="coast-stage__content">
                <Text className="weather-stage-kicker">{t("weather.selectedStation")}</Text>
                <Heading as="h2" size="lg" className="weather-stage-title">
                  {t(`weather.locations.${selectedLocation.id}.name`)}, {t(`weather.locations.${selectedLocation.id}.country`)}
                </Heading>
                <Text className="weather-stage-summary" maxW="24rem">
                  {t(`weather.locations.${selectedLocation.id}.summary`)}
                </Text>
                {snapshot ? (
                  <HStack gap={3} flexWrap="wrap">
                    <MetricTile
                      label={t("weather.metrics.air")}
                      value={formatMetric(snapshot.current.temperature, "C")}
                    />
                    <MetricTile
                      label={t("weather.metrics.sea")}
                      value={formatMetric(snapshot.marine.seaTemperature, "C")}
                    />
                    <MetricTile
                      label={t("weather.metrics.wind")}
                      value={formatMetric(snapshot.current.windSpeed, " km/h")}
                    />
                  </HStack>
                ) : null}
              </Stack>
            </Box>
          </Box>

          <Box className="weather-layout">
            <Box className="weather-card weather-card--feature">
              <Stack gap={5}>
                <HStack justify="space-between" align="flex-start" flexWrap="wrap" gap={4}>
                  <Stack gap={1}>
                    <Text className="weather-kicker">{t("weather.currentConditions")}</Text>
                    <Heading as="h2" size="lg" color="var(--weather-text-main)">
                      {t(`weather.locations.${selectedLocation.id}.name`)}
                    </Heading>
                    <Text color="var(--weather-text-muted)">
                      {t("weather.updatedFeed")}
                    </Text>
                  </Stack>

                  <Text
                    color="var(--weather-text-subtle)"
                    fontSize="0.82rem"
                  >
                    {t("weather.issuedAt", {
                      time: snapshot ? formatTimeLabel(snapshot.updatedAt, locale) : "--:--",
                      timezone: snapshot?.timezone ?? "",
                    })}
                  </Text>
                </HStack>

                {isLoading && snapshot === null ? (
                  <HStack color="var(--weather-text-soft)">
                    <Spinner size="sm" />
                    <Text>{t("weather.loading")}</Text>
                  </HStack>
                ) : null}

                {errorCode ? (
                  <Box className="weather-error">
                    <Text fontWeight="600">{t("weather.currentConditions")}</Text>
                    <Text>{t(`weather.errors.${errorCode}`)}</Text>
                  </Box>
                ) : null}

                {snapshot ? (
                  <>
                    <Box className="metric-grid">
                      <MetricTile
                        label={t("weather.metrics.conditions")}
                        value={translateWeatherCode(snapshot.current.weatherCode)}
                      />
                      <MetricTile
                        label={t("weather.metrics.feelsLike")}
                        value={formatMetric(snapshot.current.apparentTemperature, "C")}
                      />
                      <MetricTile
                        label={t("weather.metrics.humidity")}
                        value={formatMetric(snapshot.current.humidity, "%")}
                      />
                      <MetricTile
                        label={t("weather.metrics.waveHeight")}
                        value={formatMetric(snapshot.marine.waveHeight, " m")}
                      />
                      <MetricTile
                        label={t("weather.metrics.wavePeriod")}
                        value={formatMetric(snapshot.marine.wavePeriod, " s")}
                      />
                      <MetricTile
                        label={t("weather.metrics.waveDirection")}
                        value={formatMetric(snapshot.marine.waveDirection, " deg")}
                      />
                    </Box>

                    <Box className="weather-card weather-card--subtle">
                      <Stack gap={4}>
                        <HStack justify="space-between" flexWrap="wrap" gap={3}>
                          <Heading as="h3" size="md" color="var(--weather-text-main)">
                            {t("weather.sevenDayTitle")}
                          </Heading>
                          <HStack gap={4} color="var(--weather-text-muted)" fontSize="0.88rem">
                            <Text>{t("weather.sunrise", { time: formatTimeLabel(snapshot.sun.sunrise, locale) })}</Text>
                            <Text>{t("weather.sunset", { time: formatTimeLabel(snapshot.sun.sunset, locale) })}</Text>
                          </HStack>
                        </HStack>

                        <Box className="forecast-grid">
                          {snapshot.daily.map((forecastDay) => (
                            <Box key={forecastDay.date} className="forecast-card">
                              <Text className="weather-label">
                                {formatDayLabel(forecastDay.date, locale)}
                              </Text>
                              <Heading as="h4" size="sm" color="var(--weather-text-main)">
                                {translateWeatherCode(forecastDay.weatherCode)}
                              </Heading>
                              <Text color="var(--weather-text-main)" fontSize="1.2rem" fontWeight="600">
                                {Math.round(forecastDay.maxTemp)}C / {Math.round(forecastDay.minTemp)}C
                              </Text>
                              <Text color="var(--weather-text-subtle)" fontSize="0.9rem">
                                {t("weather.rainChance", { value: forecastDay.rainChance })}
                              </Text>
                              <Text color="var(--weather-text-subtle)" fontSize="0.9rem">
                                {t("weather.windSpeed", { value: Math.round(forecastDay.maxWind) })}
                              </Text>
                            </Box>
                          ))}
                        </Box>
                      </Stack>
                    </Box>
                  </>
                ) : null}
              </Stack>
            </Box>

            <Stack gap={5}>
              <Box className="weather-card weather-card--feature">
                <Stack gap={4}>
                  <Text className="weather-kicker">{t("weather.hourlyKicker")}</Text>
                  <Heading as="h3" size="md" color="var(--weather-text-main)">
                    {t("weather.hourlyTitle")}
                  </Heading>

                  {snapshot ? (
                    <Stack gap={3}>
                      {snapshot.hourly.map((hour) => (
                        <HStack
                          key={hour.time}
                          justify="space-between"
                          className="hour-row"
                        >
                          <Text color="var(--weather-text-main)" fontWeight="600">
                            {formatTimeLabel(hour.time, locale)}
                          </Text>
                          <Text color="var(--weather-text-subtle)">
                            {Math.round(hour.temperature)}C
                          </Text>
                          <Text color="var(--weather-text-subtle)">
                            {Math.round(hour.windSpeed)} km/h
                          </Text>
                          <Text color="var(--weather-text-subtle)">
                            {hour.waveHeight === null
                              ? "--"
                              : `${Math.round(hour.waveHeight * 10) / 10} m`}
                          </Text>
                        </HStack>
                      ))}
                    </Stack>
                  ) : (
                    <Text color="var(--weather-text-subtle)">{t("weather.hourlyEmpty")}</Text>
                  )}
                </Stack>
              </Box>

              <Box className="weather-card weather-card--feature">
                <Stack gap={4}>
                  <Text className="weather-kicker">{t("weather.regionalNote")}</Text>
                  <Heading as="h3" size="md" color="var(--weather-text-main)">
                    {t("weather.regionalNoteTitle")}
                  </Heading>
                  <Text className="weather-note-body">
                    {t("weather.regionalNoteBody")}
                  </Text>
                  <Text color="var(--weather-text-subtle)" fontSize="0.92rem">
                    {t("weather.dataSource")}
                  </Text>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}