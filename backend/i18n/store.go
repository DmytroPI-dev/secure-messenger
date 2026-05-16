package i18n

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed translations/*.json
var translationFiles embed.FS

func LoadPublicTranslation(language string) ([]byte, error) {
	normalized := normalizeLanguage(language)
	if normalized == "" {
		return nil, fmt.Errorf("unsupported language: %s", language)
	}

	payload, err := translationFiles.ReadFile("translations/" + normalized + ".json")
	if err != nil {
		return nil, fmt.Errorf("load translation %s: %w", normalized, err)
	}

	return payload, nil
}

func normalizeLanguage(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "en", "ru", "tr":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}
